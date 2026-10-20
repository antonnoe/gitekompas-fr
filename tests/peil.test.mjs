// Controle van de waarden in peil-config.js tegen peil/waarden.json, de kopie van de waarden uit Peil (het parameterregister van Communities Abroad).
// peil/waarden.json wordt later door de Peil-agent bijgewerkt. Na een update draait deze test en laat zien welke constante in peil-config.js mee moet.
// Draaien: node tests/peil.test.mjs (geen netwerk, geen afhankelijkheden).
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const configCode = fs.readFileSync(path.join(here, "..", "peil-config.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(here, "..", "index.html"), "utf8");
const WAARDEN = JSON.parse(fs.readFileSync(path.join(here, "..", "peil", "waarden.json"), "utf8"));
const UITLEG_URL = "https://infofrankrijk.com/ons-manifest-hoe-wij-werken/";

function laad(code = configCode) {
  const ctx = {};
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: "peil-config.js" });
  if (!ctx.GK_CONFIG) throw new Error("GK_CONFIG niet beschikbaar: peil-config.js laadt niet.");
  return ctx.GK_CONFIG;
}
const C = laad();
const gelijk = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fouten = [];
const fout = (m) => fouten.push(m);

// ---- Koppeling Peil-id en constante in peil-config.js
const KOPPELING = {
  "p.fr.micro.bic_verhuur": {
    constante: "MICRO (inkomsten 2026)",
    vergelijk: (w) => {
      const j = w && w.inkomsten_2026;
      const nc = j && j.meuble_tourisme_non_classe, cl = j && j.meuble_tourisme_classe_en_chambres_hotes;
      return [
        ["meublé non classé, abattement", C.MICRO.meuble_non.abatt, nc && nc.abattement],
        ["meublé non classé, plafond", C.MICRO.meuble_non.limit, nc && nc.plafond],
        ["meublé classé, abattement", C.MICRO.meuble_classe.abatt, cl && cl.abattement],
        ["meublé classé, plafond", C.MICRO.meuble_classe.limit, cl && cl.plafond],
        ["chambre d'hôtes, abattement", C.MICRO.cdh.abatt, cl && cl.abattement],
        ["chambre d'hôtes, plafond", C.MICRO.cdh.limit, cl && cl.plafond],
        ["verhuur eigen woning (aanname: niet-geclassificeerd), abattement", C.MICRO.own_home.abatt, nc && nc.abattement],
        ["verhuur eigen woning (aanname: niet-geclassificeerd), plafond", C.MICRO.own_home.limit, nc && nc.plafond],
        ["verhuur eigen woning is als aanname gemarkeerd", true, C.MICRO.own_home.aanname === true],
        ["jaargang in de tool", "inkomsten 2026", C.MICRO_JAAR],
      ];
    },
  },
  "p.fr.gite.minimumheffing_niet_residenten": {
    constante: "MINHEFFING",
    vergelijk: (w) => [
      ["onderste tarief van de bandbreedte", C.MINHEFFING.laag, w && w.tarief_tot_grens],
      ["bovenste tarief van de bandbreedte", C.MINHEFFING.hoog, w && w.tarief_boven_grens],
    ],
  },
  // Status te verifiëren: waarde null in Peil. De tool rekent wel met 75/50/25 procent en moet dat als aanname tonen.
  "p.fr.gite.degressieve_reeks": {
    constante: "ZFRR_REEKS (aanname, niet geverifieerd)",
    vergelijk: (w, kop) => [
      ["Peil heeft nog geen waarde (null); wijzigt dat, dan moet ZFRR_REEKS vergeleken worden", null, w],
      ["status in waarden.json is te_verifieren", "te_verifieren", kop.status],
      ["tool toont de reeks als aanname (zfrrNote)", true, /afbouw na jaar 5 \(75, 50 en 25 procent\) is een aanname/.test(indexHtml)],
      ["tool toont de reeks als aanname (uitkomst)", true, (indexHtml.match(/afbouwpercentages van 75, 50 en 25 procent zijn nog niet bij de bron geverifieerd/g) || []).length === 2],
      ["reeks in de config", { jaar1tm5: 1, jaar6: 0.75, jaar7: 0.5, jaar8: 0.25, daarna: 0 }, C.ZFRR_REEKS],
    ],
  },
};

// ---- Vaste onderdelen: labelteksten (datum alleen uit PEIL_STAND), stempel, voet, plaatsing
{
  const nl = C.peilStandNl(), kort = C.peilStandKort();
  if (C.PEIL_STAND === "2026-10-20" && (nl !== "20 oktober 2026" || kort !== "20 okt 2026")) fout(`Datumweergave klopt niet: '${nl}' en '${kort}'.`);
  if (C.PEIL_UITLEG_URL !== UITLEG_URL) fout(`PEIL_UITLEG_URL is ${C.PEIL_UITLEG_URL}, verwacht ${UITLEG_URL}.`);
  if (C.PEIL_LABEL_AAN !== true) fout("PEIL_LABEL_AAN moet true zijn.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(C.PEIL_STAND)) fout(`PEIL_STAND (${C.PEIL_STAND}) is geen datum als JJJJ-MM-DD.`);
  if (WAARDEN.stand !== C.PEIL_STAND) fout(`stand in peil/waarden.json is ${WAARDEN.stand}, maar PEIL_STAND is ${C.PEIL_STAND}.`);
  if (C.peilRegelMd() !== `[Bedragen gecontroleerd tegen Peil, stand ${nl}](${UITLEG_URL})`) fout("Markdownregel klopt niet.");
  const h = C.peilRegelHtml();
  if (!h.includes(`href="${UITLEG_URL}"`) || !h.includes('target="_blank"') || !h.includes('rel="noopener"')) fout("Stempel linkt niet naar het manifest met target _blank en rel noopener.");
  if (!h.includes(`aria-label="Bedragen gecontroleerd tegen Peil, stand ${nl}, lees hoe wij werken"`)) fout("Stempel mist de aria-label met volledige datum.");
  if (!h.includes("Gecontroleerd tegen Peil</span>") || !h.includes(`stand ${kort}<span class="peil-pijl" aria-hidden="true">&#8599;</span></span>`)) fout("Stempel mist de twee korte regels met pijltje.");
  if ((h.match(/<a /g) || []).length !== 1 || !h.includes("<svg") || (h.match(/#800000/g) || []).length < 3) fout("Stempel moet één link met inline svg in #800000 zijn.");
  const v = C.peilVoetHtml();
  if (!v.startsWith('<span class="peil-merk"') || !v.includes("<strong>Over de bedragen in deze tool.</strong> Alle wettelijke tarieven, bedragen en grenzen komen uit Peil, het register waarin wij deze gegevens bijhouden. Elk daarvan is gecontroleerd bij de officiële bron, de laatste controle was op " + nl + ". Waar de tool met een aanname of schatting rekent, staat dat bij de uitkomst. <a href=\"" + UITLEG_URL + "\" target=\"_blank\" rel=\"noopener\">Lees in ons manifest hoe wij werken</a>")) fout("Voettekstalinea wijkt af van het goedgekeurde ontwerp.");
  // Plaatsing in index.html
  if (!/<script src="peil-config\.js"><\/script>/.test(indexHtml)) fout("index.html laadt peil-config.js niet.");
  if (!/Franse accountant\/notaris\.\s*<\/div>\s*<div id="reportPeil"><\/div>/.test(indexHtml)) fout("De stempel (reportPeil) moet direct onder de disclaimer staan.");
  if (!/GK\.peilRegelHtml\(\)/.test(indexHtml) || !/GK\.peilVoetHtml\(\)/.test(indexHtml)) fout("index.html gebruikt peilRegelHtml of peilVoetHtml niet.");
  if (!/id="peilVoet"/.test(indexHtml)) fout("index.html mist de voettekstalinea (peilVoet).");
  if (/(19|20) oktober 2026/.test(indexHtml) || /Gecontroleerd tegen Peil/.test(indexHtml)) fout("Er staat een vaste peildatum of vaste stempeltekst in index.html; die komt alleen uit peil-config.js.");
  if (/antonnoe\.github\.io\/peil-nl-fr/.test(indexHtml + configCode)) fout("De tool verwijst naar de openbare Peil-site.");
  // Geen losse tariefwaarden meer in index.html
  if (/const MICRO\s*=\s*\{/.test(indexHtml) || /abatt:\s*0\.\d/.test(indexHtml)) fout("index.html bevat nog een eigen MICRO-tabel; die hoort in peil-config.js.");
  if (/chosenBase\*0\.[23]0/.test(indexHtml) || /return 0\.(75|50|25)/.test(indexHtml)) fout("index.html bevat nog losse minimumheffing- of ZFRR-percentages.");
}
// Met de schakelaar uit verdwijnt het label volledig.
{
  const uit = laad(configCode.replace("const PEIL_LABEL_AAN = true;", "const PEIL_LABEL_AAN = false;"));
  if (uit.peilRegelHtml() !== "" || uit.peilRegelMd() !== "" || uit.peilVoetHtml() !== "") fout("Met PEIL_LABEL_AAN false moet het label volledig verdwijnen.");
}

// ---- Rekenvoorbeeld op de config: micro-BIC basis = omzet x (1 - abattement)
{
  const basis = (omzet, mp) => Math.round(omzet * (1 - mp.abatt));
  if (basis(60000, C.MICRO.meuble_classe) !== 30000) fout("Micro-BIC basis voor 60.000 euro omzet bij een geclassificeerd meublé moet 30.000 euro zijn.");
  if (basis(10000, C.MICRO.meuble_non) !== 7000) fout("Micro-BIC basis voor 10.000 euro omzet bij een niet-geclassificeerd meublé moet 7.000 euro zijn.");
  if (!(70000 <= C.MICRO.meuble_classe.limit) || !(80000 <= C.MICRO.cdh.limit)) fout("Een omzet van 80.000 euro hoort bij inkomsten 2026 binnen de micro-grens van een geclassificeerd meublé of chambre d'hôtes te vallen.");
}

// ---- Koppelingen
const perId = new Map((WAARDEN.parameters || []).map((p) => [p.id, p]));
if (!perId.size) fout("peil/waarden.json bevat geen parameters.");
for (const [id, k] of Object.entries(KOPPELING)) {
  const kop = perId.get(id);
  if (!kop) { fout(`${id}: staat niet in peil/waarden.json, maar de tool gebruikt hem (${k.constante}).`); continue; }
  for (const [wat, app, peil] of k.vergelijk(kop.waarde, kop)) {
    if (!gelijk(app, peil)) fout(`${id} (${kop.naam}), ${wat}: de tool heeft ${JSON.stringify(app)}, Peil heeft ${JSON.stringify(peil)}. Constante: ${k.constante}.`);
  }
  console.log(`ok   ${id} <-> ${k.constante}`);
}
const ongebruikt = [...perId.keys()].filter((i) => !KOPPELING[i]);
if (ongebruikt.length) console.log(`info parameters in waarden.json die de tool niet gebruikt (niet vergeleken): ${ongebruikt.join(", ")}`);

if (fouten.length) {
  console.log(`\n${fouten.length} afwijking(en) tussen de tool en peil/waarden.json:`);
  fouten.forEach((m) => console.log(`FOUT ${m}`));
  process.exit(1);
}
console.log(`\nAlle ${Object.keys(KOPPELING).length} gebruikte parameters komen overeen met peil/waarden.json (stand ${C.PEIL_STAND}).`);
