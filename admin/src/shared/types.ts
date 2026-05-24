export interface LocalizedField {
  zh: string;
  en: string;
}

export interface Bearing {
  id: number;
  name: LocalizedField;
  model: string;
  price: number;
  image: string;
  category: string;
  specs: { innerDiameter: number | string; outerDiameter: number | string; width: number | string };
  stock: number;
  description: LocalizedField;
}
