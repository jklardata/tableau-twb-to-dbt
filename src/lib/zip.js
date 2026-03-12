import JSZip from "jszip";
import {
  generateDbtModel,
  generateSchemaYaml,
  generateReport,
  generateSourcesYaml,
  generateSetupMd,
  generateDbtProjectYml,
} from "./engine.js";

export async function buildZip(calcs, xmlString, workbookName) {
  const translatable = calcs.filter(
    (c) => !["skip", "untranslatable"].includes(c.complexity) && c.finalSql
  );

  const files = {};
  translatable.forEach((c) => {
    files[`models/${c.slug}.sql`] = generateDbtModel(c);
  });
  files["schema.yml"] = generateSchemaYaml(calcs);
  files["translation_report.md"] = generateReport(calcs);
  files["SETUP.md"] = generateSetupMd(calcs, workbookName);
  files["dbt_project.yml"] = generateDbtProjectYml(calcs, workbookName);

  if (xmlString) {
    const sourcesYaml = generateSourcesYaml([], xmlString);
    if (sourcesYaml) files["sources.yml"] = sourcesYaml;
  }

  return files;
}

export async function downloadAllAsZip(files, workbookName) {
  try {
    const zip = new JSZip();
    const folder = zip.folder("dbt_export");
    const models = folder.folder("models");

    Object.entries(files).forEach(([path, content]) => {
      if (path.startsWith("models/")) {
        models.file(path.replace("models/", ""), content);
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
