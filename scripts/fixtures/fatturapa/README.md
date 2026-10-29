# Schemi per la prova della fattura elettronica

Usati soltanto dai test (`scripts/test-fatturapa.js`) per validare i file XML prodotti da TIO. Non sono inclusi negli installer.

- `Schema_VFPR12_v1.2.3.xsd`: schema della fattura ordinaria tra privati pubblicato dall'Agenzia delle Entrate con le specifiche tecniche 1.9.1 (utilizzabili dal 15 maggio 2026), scaricato il 28 ottobre 2026 da https://www.agenziaentrate.gov.it/portale/specifiche-tecniche-versione-1.9.1-%C2%A0-utilizzabili-dal-15-maggio-2026-. Unica modifica: `schemaLocation` dell'import xmldsig punta al file locale, così la validazione funziona senza rete.
- `xmldsig-core-schema.xsd`: schema W3C XML Signature (REC-xmldsig-core-20020212), dalla pagina https://www.w3.org/TR/2002/REC-xmldsig-core-20020212/, distribuito con la licenza dei documenti W3C.
