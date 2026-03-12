import JSZip from "jszip";
import {
  groupByDatasource,
  generateStagingModel,
  generateFctModel,
  generateDimModel,
  generateSchemaYaml,
  generateMetricsYml,
  generateReport,
  generateSourcesYaml,
  generateSetupMd,
  generateDbtProjectYml,
} from "./engine.js";

export async function buildZip(calcs, xmlString, workbookName, grainConfig = {}, dialect = "Snowflake") {
  const datasources = groupByDatasource(calcs);
  const files = {};

  datasources.forEach((ds) => {
    const allCalcs = [...(ds.aggregates || []), ...(ds.rowLevel || [])];
    const grain = grainConfig[ds.slug] || null;

    files[`staging/stg_${ds.slug}.sql`] = generateStagingModel(ds, allCalcs, dialect);

    if (ds.aggregates?.length > 0) {
      files[`marts/fct_${ds.slug}.sql`] = generateFctModel(ds, ds.aggregates, grain, dialect);
    }
    if (ds.rowLevel?.length > 0) {
      files[`marts/dim_${ds.slug}.sql`] = generateDimModel(ds, ds.rowLevel, dialect);
    }
  });

  files["schema.yml"] = generateSchemaYaml(datasources);
  files["metrics.yml"] = generateMetricsYml(datasources);
  files["translation_report.md"] = generateReport(calcs, dialect);
  files["SETUP.md"] = generateSetupMd(calcs, workbookName, dialect);
  files["dbt_project.yml"] = generateDbtProjectYml(calcs, workbookName);

  if (xmlString) {
    const sourcesYaml = generateSourcesYaml([], xmlString, dialect);
    if (sourcesYaml) files["sources.yml"] = sourcesYaml;
  }

  return files;
}

export async function downloadAllAsZip(files, workbookName) {
  try {
    const zip = new JSZip();
    const folder = zip.folder("dbt_export");

    Object.entries(files).forEach(([path, content]) => {
      if (path.startsWith("staging/") || path.startsWith("marts/")) {
        folder.folder("models").file(path, content);
      } else {
        folder.file(path, content);
      }
    });

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (workbookName || "tableau_export").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    a.download = `${safeName}_dbt_export.zip`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error("JSZip failed:", err);
    return false;
  }
}
