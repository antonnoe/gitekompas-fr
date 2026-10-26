// Rekentest GîteKompas FR: de uitkomsten van taxCompute() en marketingCompute() tegen de wettelijke uitkomst (voorbeelden uit de keuring van 26-10-2026).
// Draaien: node tests/rekenregels.test.mjs (geen netwerk, geen afhankelijkheden).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "..", "index.html"), "utf8");
const cfg = fs.readFileSync(path.join(here, "..", "peil-config.js"), "utf8");
let js = html.split('<script src="peil-config.js"></script>')[1].split("<script>")[1].split("</script>")[0];
js = js.replace("// --- Init ---", "globalThis.__gk={state,taxCompute,marketingCompute,loanMonthlyPayment};return;");
const el = () => ({ value: "", style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, setAttribute() {}, dataset: {}, innerHTML: "", textContent: "" });
const els = {};
globalThis.window = globalThis;
globalThis.document = { getElementById: (id) => els[id] || (els[id] = el()), querySelectorAll: () => [] };
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
(0, eval)(cfg);
(0, eval)(js);
const gk = globalThis.__gk;
const defaults = JSON.parse(JSON.stringify(gk.state));

let fouten = 0, n = 0;
function check(naam, werkelijk, verwacht, marge = 0.01) {
  n++;
  const ok = typeof verwacht === "number" ? Math.abs(werkelijk - verwacht) <= marge : werkelijk === verwacht;
  if (!ok) { fouten++; console.log(`FOUT ${naam}: kreeg ${JSON.stringify(werkelijk)}, verwacht ${JSON.stringify(verwacht)}`); }
  else console.log(`ok   ${naam}`);
}
function run(f) {
  for (const k of Object.keys(defaults)) { gk.state[k] = JSON.parse(JSON.stringify(defaults[k])); }
  f(gk.state);
  return gk.taxCompute();
}

// 1. Commissie kanalenmix: standaard 40/40/20 bij 15/15/2 procent geeft 12,4 procent, niet 1240 procent.
{
  run(() => {});
  const m = gk.marketingCompute();
  check("kanalen: gewogen commissie 12,4 procent", m.weightedFeePct, 0.124, 1e-9);
  check("kanalen: kanaalkosten = 12,4 procent van de omzet", m.mid.channelFees, m.mid.grossTotal * 0.124, 0.01);
  check("kanalen: netto positief", m.mid.netAfterFees > 0, true);
  gk.state.marketing.occMid = 40;
  const mid = gk.marketingCompute().mid;
  console.log(`     (standaardscenario realistisch: omzet ${mid.grossTotal}, kanaalkosten ${mid.channelFees.toFixed(2)})`);
  // som niet 100 wordt genormaliseerd: 50/50/50 bij 15/15/0 is 10 procent
  Object.assign(gk.state.marketing, { shareAirbnb: 50, shareBooking: 50, shareDirect: 50, feeAirbnb: 15, feeBooking: 15, feeDirect: 0 });
  check("kanalen: genormaliseerd 10 procent", gk.marketingCompute().weightedFeePct, 0.10, 1e-9);
}

// 2. Minimumabattement 305 euro
check("minimumabattement: 20.000 geclassificeerd = 10.000", run((s) => { s.context.activiteit = "meuble_classe"; s.tax.omzet = 20000; s.tax.regime = "micro"; }).microBase, 10000);
check("minimumabattement: 800 non classé = 495", run((s) => { s.context.activiteit = "meuble_non"; s.tax.omzet = 800; s.tax.regime = "micro"; }).microBase, 495);
check("minimumabattement: chambre d'hôtes 500 = 195", run((s) => { s.context.activiteit = "cdh"; s.tax.omzet = 500; s.tax.regime = "micro"; }).microBase, 195);
check("minimumabattement: omzet 100 = 0", run((s) => { s.context.activiteit = "meuble_non"; s.tax.omzet = 100; }).microBase, 0);

// 3. Micro-grens op N-1 en N-2
{
  const t = run((s) => { s.context.activiteit = "meuble_non"; s.tax.omzet = 18000; s.tax.omzetVorig = 12000; s.tax.regime = "advise"; });
  check("N-1: 18.000 dit jaar, 12.000 vorig jaar: micro toegestaan", t.microAllowed, true);
  check("N-1: belastbaar 12.600", run((s) => { s.context.activiteit = "meuble_non"; s.tax.omzet = 18000; s.tax.omzetVorig = 12000; s.tax.regime = "micro"; }).chosenBase, 12600);
  const t2 = run((s) => { s.context.activiteit = "meuble_classe"; s.tax.omzet = 80000; s.tax.omzetVorig = 88000; s.tax.omzetVorig2 = 90000; s.tax.regime = "micro"; });
  check("N-2: twee jaar boven de grens: micro niet toegestaan", t2.microAllowed, false);
  check("N-2: dan régime réel", t2.chosen, "reel");
  const t3 = run((s) => { s.context.activiteit = "meuble_classe"; s.tax.omzet = 80000; s.tax.omzetVorig = 88000; s.tax.regime = "micro"; });
  check("N-2 onbekend: melding in plaats van dwang", t3.microAccess.uncertain && !!t3.microAccess.note && t3.microAllowed, true);
  const t4 = run((s) => { s.context.activiteit = "meuble_classe"; s.tax.omzet = 80000; s.tax.omzetVorig = 88000; s.tax.omzetVorig2 = 70000; s.tax.regime = "micro"; });
  check("N-2 onder de grens: micro toegestaan", t4.microAllowed, true);
  const t5 = run((s) => { s.context.activiteit = "meuble_non"; s.tax.omzet = 12000; });
  check("standaard N-1 = omzet dit jaar: geen melding onder de grens", t5.microAccess.note, null);
}

// 4. ZFRR alleen met hotelachtige diensten, en meegenomen in het regime-advies
{
  const basis = (s) => { s.context.activiteit = "meuble_classe"; s.tax.regime = "reel"; s.tax.omzet = 20000; s.tax.zfrrOk = "yes"; s.tax.zfrrYear = 1; };
  check("ZFRR zonder diensten: geen vrijstelling", run((s) => { basis(s); }).zP, 0);
  check("ZFRR zonder diensten: basis 20.000", run((s) => { basis(s); }).chosenBase, 20000);
  check("ZFRR met diensten, jaar 1: belastbaar 0", run((s) => { basis(s); s.tax.zfrrDiensten = "yes"; }).chosenBase, 0);
  check("ZFRR met diensten, jaar 6: 5.000", run((s) => { basis(s); s.tax.zfrrDiensten = "yes"; s.tax.zfrrYear = 6; }).chosenBase, 5000);
  check("ZFRR met diensten, jaar 7: 10.000", run((s) => { basis(s); s.tax.zfrrDiensten = "yes"; s.tax.zfrrYear = 7; }).chosenBase, 10000);
  const adv = run((s) => { basis(s); s.tax.regime = "advise"; s.tax.zfrrDiensten = "yes"; s.tax.omzet = 30000; s.financials.opexOverig = 10000; });
  check("advies neemt ZFRR mee: réel (0) wint van micro (15.000)", adv.advice.recommended, "reel");
  const advNee = run((s) => { basis(s); s.tax.regime = "advise"; s.tax.omzet = 30000; s.financials.opexOverig = 10000; });
  check("advies zonder diensten: micro (15.000) wint van réel (20.000)", advNee.advice.recommended, "micro");
}

// 5. Eigen gebruik in het régime réel (BOFiP CHAMP-40-20 § 59)
{
  const basis = (s) => { s.tax.regime = "reel"; s.tax.omzet = 30000; s.financials.opexOverig = 10000; s.financials.capexRenov = 100000; s.tax.depPct = 3; };
  check("eigen gebruik 0 procent: 17.000", run((s) => { basis(s); s.project.eigenGebruik = 0; }).chosenBase, 17000);
  check("eigen gebruik 10 procent: 18.300", run((s) => { basis(s); s.project.eigenGebruik = 10; }).chosenBase, 18300);
}

// 6. Minimumheffing niet-residenten (art. 197 A)
{
  const non = (s, base, wereld) => { s.context.residentie = "non"; s.context.activiteit = "meuble_classe"; s.tax.regime = "reel"; s.tax.omzet = base; s.tax.worldIncome = wereld || 0; };
  check("minimumheffing: 10.000 = 2.000", run((s) => non(s, 10000)).minTax.amount, 2000);
  check("minimumheffing: 70.000 = 18.042,10", run((s) => non(s, 70000)).minTax.amount, 18042.10);
  const w = run((s) => non(s, 10000, 40000)).minTax;
  check("minimumheffing: wereldinkomen 40.000, taux moyen 12,76 procent = 1.276", w.amount, 1276.0, 0.5);
  check("minimumheffing: barème op 40.000 = 5.103,99 (taux moyen)", w.tauxMoyen * 40000, 5103.99, 0.01);
  check("minimumheffing: wereldinkomen met hoger taux moyen: minimum blijft", run((s) => non(s, 10000, 150000)).minTax.amount, 2000);
  check("minimumheffing: geen minTax voor residenten", run((s) => { s.context.residentie = "fr"; }).minTax, null);
}

// N1. Bij 0 nachten geen verblijf, schoonmaak of commissie
{
  run(() => {});
  Object.assign(gk.state.marketing, { occLow: 0, cleaningPerStay: 50 });
  const lo = gk.marketingCompute().low;
  check("0 nachten: geen verblijven", lo.stays, 0);
  check("0 nachten: omzet 0", lo.grossTotal, 0);
  check("0 nachten: commissie 0", lo.channelFees, 0);
}

// N2. Leningrente aftrekbaar in het réel (art. 39, 1 CGI)
{
  const t = run((s) => { s.tax.regime = "reel"; s.tax.omzet = 30000; s.project.eigenGebruik = 0; s.financials.finLening = 200000; s.financials.finRente = 3.5; s.financials.finJaren = 20; });
  // eerste jaar: rente over een afnemend saldo, circa 6.900 euro
  check("lening: rente eerste jaar circa 6.900", t.rc.interest > 6800 && t.rc.interest < 7000, true);
  check("lening: basis = omzet min rente", t.chosenBase, 30000 - t.rc.interest, 0.01);
  check("lening: geen lening, geen rente", run((s) => { s.tax.regime = "reel"; }).rc.interest, 0);
}

// N3. Afschrijving die doorschuift (art. 39 C, II, 3)
{
  const t = run((s) => { s.tax.regime = "reel"; s.project.eigenGebruik = 0; s.tax.omzet = 20000; s.financials.opexOverig = 15000; s.financials.capexRenov = 100000; s.tax.depPct = 10; });
  check("afschrijving: belastbaar 0", t.chosenBase, 0);
  check("afschrijving: 5.000 geboekt, 5.000 schuift door", t.rc.depCarry, 5000);
}

// R1. Startjaar: micro-BIC altijd, omzet omgerekend naar 365 dagen (art. 50-0, 1 CGI; BOFiP BOI-BIC-DECLA-10-10-20 § 30, § 35, § 50)
{
  const sj = (s) => { s.context.activiteit = "meuble_non"; s.context.start = "2026-08"; s.tax.omzet = 9000; s.tax.regime = "micro"; s.tax.startjaar = "start"; };
  const t = run(sj);
  check("startjaar: start 1 augustus, 9.000: omgerekend 21.471", t.microAccess.omgerekend, 21470.59, 0.01);
  check("startjaar: micro toegestaan", t.microAllowed, true);
  check("startjaar: belastbaar 6.300", t.chosenBase, 6300);
  const t2 = run((s) => { s.context.activiteit = "meuble_non"; s.context.start = "2026-03"; s.tax.omzet = 40000; s.tax.omzetVorig = 40000; s.tax.omzetVorig2 = 40000; s.tax.regime = "micro"; s.tax.startjaar = "start"; });
  check("startjaar boven de grens: micro blijft toegestaan", t2.microAllowed && t2.chosen === "micro", true);
  const t3 = run((s) => { s.context.activiteit = "meuble_classe"; s.tax.omzet = 90000; s.tax.omzetVorig = 90000; s.tax.omzetVorig2 = 90000; s.tax.regime = "micro"; s.tax.startjaar = "na"; });
  check("jaar na het startjaar: micro toegestaan", t3.microAllowed && t3.chosen === "micro", true);
  check("seizoensbedrijf: geen omrekening", run((s) => { sj(s); s.project.jaarrond = "seasonal"; }).microAccess.omgerekend, null);
  const t4 = run((s) => { s.context.activiteit = "meuble_classe"; s.tax.omzet = 80000; s.tax.omzetVorig = 88000; s.tax.omzetVorig2 = 90000; s.tax.regime = "micro"; });
  check("standaard geen startjaar: twee jaar boven de grens blijft réel", t4.chosen, "reel");
}

// R2. Verlies bij LMNP schuift door (art. 156, I, 1° ter CGI); eigen gebruik: kosten naar rato niet aftrekbaar
{
  const basis = (s) => { s.tax.regime = "reel"; s.project.eigenGebruik = 0; s.tax.omzet = 10000; s.financials.opexOverig = 14000; };
  const t = run(basis);
  check("LMNP: belastbaar 0", t.chosenBase, 0);
  check("LMNP: verlies 4.000 schuift door", t.rc.verliesCarry, 4000);
  const lmp = run((s) => { basis(s); s.tax.status = "lmp"; });
  check("LMP: geen doorschuivend LMNP-verlies", lmp.rc.verliesCarry, 0);
  check("LMP: verlies wel bekend (4.000)", lmp.rc.verlies, 4000);
  const eg = run((s) => { s.tax.regime = "reel"; s.tax.omzet = 30000; s.financials.opexOverig = 10000; s.project.eigenGebruik = 10; });
  check("LMNP eigen gebruik 10 procent: kosten 9.000 aftrekbaar, basis 21.000", eg.chosenBase, 21000);
}

// R3. ZFRR: oprichtingsperiode 1-7-2024 tot en met 31-12-2029 en minder dan 11 werknemers (art. 44 quindecies A, I B en V)
{
  const basis = (s) => { s.context.activiteit = "meuble_classe"; s.tax.regime = "reel"; s.tax.omzet = 20000; s.tax.zfrrOk = "yes"; s.tax.zfrrDiensten = "yes"; s.tax.zfrrYear = 1; };
  check("ZFRR standaard (voorwaarden ja): belastbaar 0", run(basis).chosenBase, 0);
  check("ZFRR voorwaarden nee: 20.000", run((s) => { basis(s); s.tax.zfrrVoorwaarden = "no"; }).chosenBase, 20000);
  check("ZFRR start juni 2024: buiten periode, 20.000", run((s) => { basis(s); s.context.start = "2024-06"; }).chosenBase, 20000);
  check("ZFRR start juli 2024: binnen periode, 0", run((s) => { basis(s); s.context.start = "2024-07"; }).chosenBase, 0);
  check("ZFRR start januari 2030: buiten periode, 20.000", run((s) => { basis(s); s.context.start = "2030-01"; }).chosenBase, 20000);
}

console.log(fouten ? `\n${fouten} van ${n} controles mislukt.` : `\nAlle ${n} rekencontroles komen overeen met de wettelijke uitkomst.`);
process.exit(fouten ? 1 : 0);
