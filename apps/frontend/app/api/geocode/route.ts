import { NextRequest, NextResponse } from 'next/server';

const MAPTILER_KEY = process.env.MAPTILER_API_KEY;

interface MapTilerContext {
  id: string;
  text: string;
  short_code?: string;
}

// MapTiler renvoie des Features GeoJSON avec une structure variable selon
// place_type : pour un type 'address', `text` = rue, `address` = n° de rue.
// Pour 'street', 'place', 'locality', etc., `text` est l'entité elle-même.
interface MapTilerFeature {
  place_name?: string;
  place_type?: string[];
  text?: string;
  address?: string;
  context?: MapTilerContext[];
  properties?: Record<string, unknown>;
}

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

function ctxText(ctx: MapTilerContext[] | undefined, ...prefixes: string[]): string | undefined {
  if (!ctx) return undefined;
  for (const prefix of prefixes) {
    const found = ctx.find((c) => c.id?.startsWith(prefix));
    if (found) return found.text;
  }
  return undefined;
}

function ctxShortCode(ctx: MapTilerContext[] | undefined, prefix: string): string | undefined {
  return ctx?.find((c) => c.id?.startsWith(prefix))?.short_code;
}

// MapTiler ne gère pas les suffixes français "bis/ter/quater". On les retire
// avant la requête puis on les réinjecte dans le numéro affiché.
const BIS_TER_RE = /(\d+)\s+(bis|ter|quater|quinquies)\b/i;

function stripSuffix(q: string): { cleaned: string; suffix: string | null } {
  const m = q.match(BIS_TER_RE);
  if (!m) return { cleaned: q, suffix: null };
  return { cleaned: q.replace(BIS_TER_RE, m[1]), suffix: m[2].toLowerCase() };
}

function normalize(f: MapTilerFeature, suffix: string | null): NormalizedFeature {
  const types = f.place_type ?? [];
  const isAddress = types.includes('address');
  const isStreet = types.includes('street');
  const isPlace = types.some((t) => ['place', 'municipality', 'locality', 'neighbourhood'].includes(t));

  // Rue : pour un address ou street feature, `text` est le nom de la rue.
  // Pour une place/poi, on n'a pas de rue.
  let street: string | undefined;
  let housenumber: string | undefined;
  let name: string | undefined;

  if (isAddress) {
    street = f.text;
    housenumber = suffix && f.address ? `${f.address} ${suffix}` : f.address;
  } else if (isStreet) {
    street = f.text;
  } else if (isPlace) {
    name = f.text;
  } else {
    name = f.text ?? f.place_name;
  }

  const city = isPlace
    ? f.text
    : ctxText(f.context, 'municipality', 'place', 'locality');
  const postcode = ctxText(f.context, 'postal_code');
  const country = ctxText(f.context, 'country');
  const country_code = (ctxShortCode(f.context, 'country') ?? '').toUpperCase();

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

  const { cleaned, suffix } = stripSuffix(q);
  const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(cleaned)}.json`);
  url.searchParams.set('key', MAPTILER_KEY);
  url.searchParams.set('language', 'fr');
  url.searchParams.set('limit', '10');
  url.searchParams.set('autocomplete', 'true');
  url.searchParams.set('fuzzyMatch', 'true');
  url.searchParams.set('types', 'address,street,place,postal_code,locality,municipality,neighbourhood,poi');
  if (country) url.searchParams.set('country', country);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      return NextResponse.json({ features: [] }, { status: 502 });
    }
    const data = (await res.json()) as { features?: MapTilerFeature[] };
    const features = (data.features ?? []).map((f) => normalize(f, suffix));
    return NextResponse.json({ features });
  } catch {
    return NextResponse.json({ features: [] }, { status: 502 });
  }
}
