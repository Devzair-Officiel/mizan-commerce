export type PublicPageTheme = 'classic' | 'modern' | 'minimal';

export type PublicContactType = 'whatsapp' | 'telegram' | 'instagram' | 'phone';

export type PublicSectionType =
  | 'header'
  | 'description'
  | 'products'
  | 'services'
  | 'contact';

export interface PublicSection {
  id: string;
  type: PublicSectionType;
  position: number;
  title: string;
  content: string;
}

export interface PublicCatalogItem {
  id: string;
  name: string;
  description: string;
  type: 'product' | 'service';
  price: string | null;
  image_url: string | null;
  show_price: boolean;
  badge_promo: boolean;
  badge_new: boolean;
  is_out_of_stock: boolean;
  position: number;
}

export interface PublicContact {
  id: string;
  type: PublicContactType;
  value: string;
  label: string;
  is_primary: boolean;
  position: number;
}

export interface PublicPageData {
  slug: string;
  display_name: string;
  tagline: string;
  description: string;
  theme: PublicPageTheme;
  primary_color: string;
  is_published: boolean;
  order_message_template: string;
  shop_name: string;
  currency: string;
  logo_url: string | null;
  cover_url: string | null;
  sections: PublicSection[];
  products: PublicCatalogItem[];
  services: PublicCatalogItem[];
  contacts: PublicContact[];
  primary_contact: PublicContact | null;
}
