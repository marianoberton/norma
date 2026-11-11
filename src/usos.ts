/**
 * Cuadro de usos del suelo: una fila por rubro, en columnas y con su leyenda.
 *
 * Las filas salen del índice (las mismas que lee el agente; una por rubro, con el texto partido por « · »).
 * La leyenda y los rubros en revisión salen de data/v2/cur/cuadro-usos.json, que arma
 * ingest_v2/cuadro_usos.py con dos lecturas de la planilla de referencias y la capa de texto del código.
 * Cada código de una celda se busca en su propia tabla de referencias (la «C» de una mixtura no es la de
 * otra columna). Lo que no está en las referencias vuelve tal cual, marcado: no se adivina.
 */
import { existsSync, readFileSync } from "node:fs";
import type { ChunkRecord, RegistroV2 } from "./lib/vector-store.js";

type Grupo = "general" | "EST" | "BICI" | "CyD";
interface Entrada { significado: string | null; seccion: string; verificada: boolean; incompleta?: boolean; nota?: string }
export interface DatosUsos {
  cuadro: string;
  archivos: string[];
  referencias: { articulo: string; pagina: number };
  leyenda: Record<Grupo, Record<string, Entrada>>;
  en_revision: Record<string, { motivo: string; planilla: { texto: string; pagina: number } }>;
}

export function cargarDatosUsos(path: string): DatosUsos | null {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

/** «4\n(Alta\nMixtura de Usos)» y «Observacio-\nnes» son los mismos encabezados que en una línea. */
const limpiarEncabezado = (h: string) => h.replace(/-\s*\n\s*/g, "").replace(/\s+/g, " ").trim();

export interface FilaUsos {
  rubro: string;
  nombre: string;
  mixtura: Record<"1" | "2" | "3" | "4", string | null>;
  nombres_mixtura: Record<string, string>;
  EST: string | null;
  BICI: string | null;
  CyD: string | null;
  observaciones: string | null;
}

/** Parte el texto de una fila del índice: «<cuadro> · rubro X «nombre» · <columna>: <valor> · …». */
export function partirFila(texto: string): FilaUsos | null {
  const partes = texto.split(" · ");
  const m = (partes[1] ?? "").match(/^rubro (\S+) «([\s\S]*)»$/);
  if (!m) return null;
  const f: FilaUsos = { rubro: m[1], nombre: m[2].trim(), mixtura: { "1": null, "2": null, "3": null, "4": null }, nombres_mixtura: {},
    EST: null, BICI: null, CyD: null, observaciones: null };
  // Lo que viene después de «Observaciones:» puede traer « · » propio: va todo a esa columna.
  for (let i = 2; i < partes.length; i++) {
    const p = partes[i];
    const k = p.indexOf(": ");
    if (k < 0) continue;
    const h = limpiarEncabezado(p.slice(0, k));
    const v = p.slice(k + 2).trim();
    const mx = h.match(/^([1-4])\s*\((.*)\)$/);
    if (mx) { f.mixtura[mx[1] as "1"] = v; f.nombres_mixtura[mx[1]] = mx[2]; }
    else if (h === "EST" || h === "BICI" || h === "CyD") f[h] = v;
    else if (/^observaciones$/i.test(h)) { f.observaciones = [v, ...partes.slice(i + 1)].join(" · "); break; }
  }
  return f;
}

const GRUPO_DE_COLUMNA: Record<string, Grupo> = { "1": "general", "2": "general", "3": "general", "4": "general", EST: "EST", BICI: "BICI", CyD: "CyD" };

export interface Lectura { columna: string; codigo: string; significado: string | null; seccion: string | null; verificada: boolean; nota?: string }

/** Decodifica un valor de celda en su tabla de referencias. «1200/SA» y «2500 SA» son dos referencias. */
export function decodificar(datos: DatosUsos, columna: string, valor: string | null): Lectura[] {
  if (!valor) return [];
  const grupo = GRUPO_DE_COLUMNA[columna];
  const tabla = datos.leyenda[grupo];
  const general = datos.leyenda.general;
  const out: Lectura[] = [];
  const de = (codigo: string, e: Entrada, nota?: string): Lectura => ({
    columna, codigo, significado: e.significado, seccion: e.seccion, verificada: e.verificada,
    ...(nota || e.nota ? { nota: [nota, e.nota].filter(Boolean).join(" ") } : {}),
  });
  for (const t of valor.split(/[/\s]+/).filter(Boolean)) {
    if (t === "/" ) continue;
    if (/^[-–—_]$/.test(t) && general["—"]) { out.push(de(t, general["—"])); continue; }
    if (tabla[t]) { out.push(de(t, tabla[t])); continue; }
    // EST «28b»: inciso b) de la referencia 28.
    const inc = grupo === "EST" ? t.match(/^(\d+)([a-z])$/) : null;
    if (inc && tabla[inc[1]]?.significado) {
      const e = tabla[inc[1]];
      const m = e.significado!.match(new RegExp(`(?:^|\\s)${inc[2]}\\)\\s*([\\s\\S]*?)(?=\\s[a-z]\\)\\s|$)`));
      out.push({ columna, codigo: t, significado: m ? m[1].trim() : e.significado, seccion: e.seccion, verificada: e.verificada,
        nota: m ? `Inciso ${inc[2]}) de la referencia ${inc[1]}.` : `Referencia ${inc[1]}; no se encontró el inciso ${inc[2]}) en su texto.` });
      continue;
    }
    // «500SA»: dos códigos pegados en la transcripción.
    const pegado = t.match(/^(\d+[A-Za-z]?)([A-Z]{2,})$/) ?? t.match(/^(\d+)([A-Z]{2,})$/);
    if (pegado && tabla[pegado[1]] && tabla[pegado[2]]) {
      out.push(de(pegado[1], tabla[pegado[1]], `Separado de «${t}».`), de(pegado[2], tabla[pegado[2]], `Separado de «${t}».`));
      continue;
    }
    const pista = grupo === "BICI" && t === "I" && tabla["l"] ? " Puede ser la «l» transcrita como «I» mayúscula: confirmar contra la imagen." : "";
    out.push({ columna, codigo: t, significado: null, seccion: null, verificada: false,
      nota: `«${t}» no figura en las referencias de ${grupo === "general" ? "las Áreas de Mixtura" : grupo}.${pista}` });
  }
  return out;
}

/** Códigos de la tabla general que aparecen sueltos en Observaciones («NPC – Ver art. …»). */
function codigosEnObservaciones(datos: DatosUsos, obs: string | null): Lectura[] {
  if (!obs) return [];
  const g = datos.leyenda.general;
  return [...new Set(obs.match(/\b[A-Z][A-Z0-9]{1,5}\b/g) ?? [])]
    .filter((c) => g[c] && !["SI", "NO", "EST", "BICI"].includes(c))
    .map((c) => ({ columna: "Observaciones", codigo: c, significado: g[c].significado, seccion: g[c].seccion, verificada: g[c].verificada }));
}

const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();

interface Figura { id: string; url: string; pagina: number }

/** Filas del cuadro por número de rubro (exacto) o por nombre (texto contenido, sin tildes). */
export function buscarUsos(
  registros: readonly ChunkRecord[],
  datos: DatosUsos,
  pedido: { rubro?: string | null; q?: string | null },
  figurasDe: (r: ChunkRecord) => Figura[],
  limite = 20,
) {
  const filas = registros.filter((r) => datos.archivos.includes(r.archivo_origen) && (r as RegistroV2).rubro);
  const rubro = pedido.rubro?.trim().replace(/\.$/, "");
  const q = pedido.q ? plano(pedido.q) : "";
  const elegidas = rubro
    ? filas.filter((r) => (r as RegistroV2).rubro === rubro)
    : filas.filter((r) => { const f = partirFila(r.text); return f && plano(`${f.rubro} ${f.nombre}`).includes(q); });
  // El cuerpo principal primero; la planilla solo trae los rubros que el cuerpo no tiene.
  elegidas.sort((a, b) => datos.archivos.indexOf(a.archivo_origen) - datos.archivos.indexOf(b.archivo_origen) || a.chunk_index - b.chunk_index);
  const total = elegidas.length;
  return {
    total,
    filas: elegidas.slice(0, limite).map((r) => {
      const x = r as RegistroV2;
      const f = partirFila(r.text)!;
      const cols: [string, string | null][] = [["1", f.mixtura["1"]], ["2", f.mixtura["2"]], ["3", f.mixtura["3"]], ["4", f.mixtura["4"]],
        ["EST", f.EST], ["BICI", f.BICI], ["CyD", f.CyD]];
      const leyenda = [...cols.flatMap(([c, v]) => decodificar(datos, c, v)), ...codigosEnObservaciones(datos, f.observaciones)];
      const rev = datos.en_revision[f.rubro];
      return {
        rubro: f.rubro, nombre: f.nombre,
        columnas: { mixtura: f.mixtura, EST: f.EST, BICI: f.BICI, CyD: f.CyD, observaciones: f.observaciones },
        nombres_mixtura: f.nombres_mixtura,
        texto: r.text,
        leyenda,
        sin_referencia: leyenda.filter((l) => !l.significado).map((l) => `${l.columna}: ${l.codigo}`),
        en_revision: Boolean(rev),
        ...(rev ? { revision: rev } : {}),
        fuente: r.archivo_origen === datos.archivos[0] ? "cuerpo principal" : "planilla «Usos y referencias»",
        documento: r.documento, ubicacion: r.ubicacion, pdf: r.pdf_respaldo, pagina: x.pagina ?? null,
        imagen: figurasDe(r)[0] ?? null,
      };
    }),
    referencias: datos.referencias,
  };
}
