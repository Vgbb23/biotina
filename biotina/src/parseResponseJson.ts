/**
 * Lê o corpo da resposta e faz parse de JSON.
 * Evita crash quando o servidor devolve HTML ou texto (ex.: erro da Vercel).
 */
export async function parseResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  const t = text.trim();
  if (!t) {
    throw new Error(`Resposta vazia (HTTP ${response.status}).`);
  }
  const first = t[0];
  if (first !== "{" && first !== "[") {
    if (import.meta.env.DEV) {
      console.error("[parseResponseJson] corpo não-JSON:", t.slice(0, 400));
    }
    throw new Error(
      `Serviço temporariamente indisponível (HTTP ${response.status}). Tente novamente em instantes.`
    );
  }
  try {
    return JSON.parse(t) as unknown;
  } catch {
    throw new Error(`Resposta inválida da API (HTTP ${response.status}).`);
  }
}
