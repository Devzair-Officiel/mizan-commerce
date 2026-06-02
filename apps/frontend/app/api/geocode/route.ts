import { NextRequest, NextResponse } from 'next/server';

const MAPTILER_KEY = process.env.MAPTILER_API_KEY;

interface MapTilerContext {
  id: string;
  text: string;
  short_code?: string;
}

interface MapTilerFeature {
  place_name?: string;
  text?: string;
  address?: string;
  context?: MapTilerContext[];
  properties?: {
    street?: string;
    housenumber?: string;
    city?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

// Sortie normalisée pour rester compatible avec le composant AddressAutocomplete
// (qui s'attendait au format Photon — on garde la même shape).
interface NormalizedFeature {
  properties: {
    housenumber?: string;
    street?: string;
    name?: string;
    city?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

function contextEntry(ctx: MapTilerContext[] | undefined, prefix: string): MapTilerContext | undefined {
  return ctx?.find((c) => c.id?.startsWith(prefix));
}

function normalize(f: MapTilerFeature): NormalizedFeature {
  const p = f.properties ?? {};
  const ctx = f.context;

  const street = p.street;
  const housenumber = p.housenumber ?? f.address;
  const city = p.city ?? contextEntry(ctx, 'place')?.text ?? contextEntry(ctx, 'municipality')?.text;
  const postcode = p.postcode ?? contextEntry(ctx, 'postal_code')?.text;
  const countryCtx = contextEntry(ctx, 'country');
  const country = p.country ?? countryCtx?.text;
  const country_code = (p.country_code ?? countryCtx?.short_code ?? '').toUpperCase();

  // Le nom affiché : on garde `text` (souvent le nom de rue) ou place_name en fallback
  const name = !street ? (f.text ?? f.place_name) : undefined;

  return {
    properties: { housenumber, street, name, city, postcode, country, country_code },
  };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!MAPTILER_KEY) {
    return NextResponse.json({ features: [] }, { status: 500 });
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const country = req.nextUrl.searchParams.get('country')?.trim().toLowerCase() ?? '';

  if (q.length < 3) {
    return NextResponse.json({ features: [] });
  }

  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json`);
  url.searchParams.set('key', MAPTILER_KEY);
  url.searchParams.set('language', 'fr');
  url.searchParams.set('limit', '5');
  if (country) url.searchParams.set('country', country);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      return NextResponse.json({ features: [] }, { status: 502 });
    }
    const data = (await res.json()) as { features?: MapTilerFeature[] };
    const features = (data.features ?? []).map(normalize);
    return NextResponse.json({ features });
  } catch {
    return NextResponse.json({ features: [] }, { status: 502 });
  }
}
