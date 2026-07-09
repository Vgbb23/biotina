/**
 * Catálogo dos kits Biotina 100% Pura Body Action — valores base usados pela landing.
 * O bridge PIX (`fruitfyBridge`) encaminha `amount` em centavos vindo do checkout;
 * este arquivo documenta os preços base esperados por kit.
 */

export type KitCatalogEntry = {
  id: number;
  name: string;
  treatmentLabel: string;
  /** Preço à vista / principal (R$). */
  priceBRL: number;
  image: string;
  popular: boolean;
};

export const KIT_CATALOG: readonly KitCatalogEntry[] = [
  {
    id: 1,
    name: "1 Pote",
    treatmentLabel: "60 cápsulas | 1 mês",
    priceBRL: 34.9,
    image: "https://i.ibb.co/hx2NpL7t/image.png",
    popular: false,
  },
  {
    id: 2,
    name: "2 Potes",
    treatmentLabel: "120 cápsulas | 2 meses",
    priceBRL: 49.9,
    image: "https://i.ibb.co/SX0TBcTf/image.png",
    popular: false,
  },
  {
    id: 3,
    name: "3 Potes",
    treatmentLabel: "180 cápsulas | 3 meses",
    priceBRL: 69.9,
    image: "https://i.ibb.co/4R9pDW4W/image.png",
    popular: true,
  },
];

/** Preço “de” (riscado) = 2× o preço promocional, como na UI. */
export function listPriceBRLFromKit(priceBRL: number): number {
  return Math.round(priceBRL * 2 * 100) / 100;
}

export function formatBRL(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

/** Parcela 12× a partir do total do kit. */
export function installment12Label(priceBRL: number): string {
  return formatBRL(Math.round((priceBRL / 12) * 100) / 100);
}
