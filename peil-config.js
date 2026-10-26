/* GîteKompas FR: vaste waarden en Peil-label op één plek.
   De waarden komen uit Peil, het parameterregister van Communities Abroad (privé); peil/waarden.json is de kopie en tests/peil.test.mjs bewaakt dat dit bestand ermee overeenkomt.
   Bij elke controle alleen PEIL_STAND aanpassen (en peil/waarden.json). */
(function (g) {
  "use strict";

  // Micro-BIC (art. 50-0 CGI), inkomsten 2026. Bron: Brochure pratique IR 2026 en fiche F23267 (Peil: p.fr.micro.bic_verhuur, gecontroleerd 19 oktober 2026).
  // Voor inkomsten 2025 gold voor geclassificeerde meublés en chambres d'hôtes een plafond van 77.700 euro (zelfde abattement); het niet-geclassificeerde plafond is 15.000 euro bij 30 procent.
  const MICRO = {
    meuble_non:    { abatt: 0.30, limit: 15000, label: "Meublé non classé" },
    meuble_classe: { abatt: 0.50, limit: 83600, label: "Meublé classé" },
    cdh:           { abatt: 0.50, limit: 83600, label: "Chambre d’hôtes" },
    // Aanname van de tool: verhuur van de eigen woning aan toeristen wordt als niet-geclassificeerd meublé gerekend. Peil kent deze categorie niet apart.
    own_home:      { abatt: 0.30, limit: 15000, label: "Verhuur eigen woning (indicatief)", aanname: true }
  };
  const MICRO_JAAR = "inkomsten 2026";

  // Minimumabattement micro-BIC: het abattement bedraagt minstens 305 euro (art. 50-0, 1 CGI, "Ces abattements ne peuvent être inférieurs à 305 €"; BOFiP BOI-BIC-CHAMP-40-20 § 55).
  const MICRO_MIN_ABATT = 305;

  // Minimumheffing niet-residenten (art. 197 A CGI): 20 procent tot en met de grens (bovengrens van de tweede schijf, art. 197 I 1, inkomsten 2025) en 30 procent over het deel daarboven (Peil: p.fr.gite.minimumheffing_niet_residenten).
  const MINHEFFING = { laag: 0.20, hoog: 0.30, grens: 29579 };

  // Barème impôt sur le revenu per part, inkomsten 2025 (art. 197 I 1 CGI, LF 2026; Peil: p.fr.ir.schijven). Alleen gebruikt om het gemiddelde tarief (taux moyen) bij de minimumheffing van art. 197 A te bepalen; zonder décote, die geldt niet voor niet-residenten.
  const IR_SCHIJVEN = [
    { tot: 11600, tarief: 0 },
    { tot: 29579, tarief: 0.11 },
    { tot: 84577, tarief: 0.30 },
    { tot: 181917, tarief: 0.41 },
    { tot: null, tarief: 0.45 }
  ];

  // Afbouw van de ZFRR-vrijstelling per exploitatiejaar: volledig tot het einde van de 59e maand, daarna belast voor een kwart, de helft en driekwart, dus vrijgesteld 75, 50 en 25 procent (art. 44 quindecies A, I B en I E CGI, LEGIARTI000053564785, gelezen 26-10-2026). In Peil (p.fr.gite.degressieve_reeks) staat nog te verifiëren; correctievoorstel ingediend bij de keuring van 26-10-2026.
  const ZFRR_REEKS = { jaar1tm5: 1.0, jaar6: 0.75, jaar7: 0.50, jaar8: 0.25, daarna: 0 };

  // Peil-label. Zolang PEIL_LABEL_AAN false is, toont de tool niets over Peil.
  const PEIL_STAND = "2026-10-26";
  const PEIL_LABEL_AAN = true;
  const PEIL_UITLEG_URL = "https://infofrankrijk.com/ons-manifest-hoe-wij-werken/";
  // Toolkaart van deze tool; de Peil-stempel linkt hiernaartoe (het manifest blijft de link in de voettekstalinea).
  const PEIL_KAART_URL = "https://communitiesabroad.com/manifest/tool/gitekompas-fr";
  const MAANDEN_NL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const MAANDEN_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
  function peilStandNl() {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(PEIL_STAND);
    return m ? `${parseInt(m[3], 10)} ${MAANDEN_NL[parseInt(m[2], 10) - 1]} ${m[1]}` : PEIL_STAND;
  }
  function peilStandKort() {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(PEIL_STAND);
    return m ? `${parseInt(m[3], 10)} ${MAANDEN_KORT[parseInt(m[2], 10) - 1]} ${m[1]}` : PEIL_STAND;
  }
  const PEIL_MERK = `<span class="peil-merk" aria-hidden="true">&#10003;</span>`;
  // Compacte stempelknop: merkteken met dubbele ring en vinkje, twee korte regels, het geheel is één link naar het manifest.
  function peilRegelHtml() {
    if (!PEIL_LABEL_AAN) return "";
    const aria = `Bedragen gecontroleerd tegen Peil, stand ${peilStandNl()}, bekijk wat er gecontroleerd is`;
    return `<div class="peil-stempel-rij"><a class="peil-stempel" href="${PEIL_KAART_URL}" target="_blank" rel="noopener" aria-label="${escapeHtml(aria)}"><svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="20" r="18.5" fill="#fff" stroke="#800000" stroke-width="1.6"/><circle cx="20" cy="20" r="14.5" fill="none" stroke="#800000" stroke-width="1"/><path d="M13.5 20.5 L18 25 L26.5 15.5" fill="none" stroke="#800000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="peil-stempel__tk" aria-hidden="true"><span class="peil-stempel__t1">Gecontroleerd tegen Peil</span><span class="peil-stempel__t2">stand ${escapeHtml(peilStandKort())}<span class="peil-pijl" aria-hidden="true">&#8599;</span></span></span></a></div>`;
  }
  function peilRegelMd() {
    if (!PEIL_LABEL_AAN) return "";
    return `[Bedragen gecontroleerd tegen Peil, stand ${peilStandNl()}](${PEIL_UITLEG_URL})`;
  }
  function peilVoetHtml() {
    if (!PEIL_LABEL_AAN) return "";
    return `${PEIL_MERK}<strong>Over de bedragen in deze tool.</strong> Alle wettelijke tarieven, bedragen en grenzen komen uit Peil, het register waarin wij deze gegevens bijhouden. Elk daarvan is gecontroleerd bij de officiële bron, de laatste controle was op ${escapeHtml(peilStandNl())}. Waar de tool met een aanname of schatting rekent, staat dat bij de uitkomst. <a href="${PEIL_UITLEG_URL}" target="_blank" rel="noopener">Lees in ons manifest hoe wij werken</a>`;
  }

  g.GK_CONFIG = { MICRO, MICRO_JAAR, MICRO_MIN_ABATT, MINHEFFING, IR_SCHIJVEN, ZFRR_REEKS, PEIL_STAND, PEIL_LABEL_AAN, PEIL_UITLEG_URL, PEIL_KAART_URL, peilStandNl, peilStandKort, peilRegelHtml, peilRegelMd, peilVoetHtml };
})(typeof window !== "undefined" ? window : globalThis);
