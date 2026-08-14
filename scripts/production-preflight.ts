import { formatProductionRuntimeIssues, validateProductionRuntimeConfig } from "../src/config/production-runtime";

const issues = validateProductionRuntimeConfig(process.env);

if (issues.length > 0) {
  console.error("Production runtime preflight: FAIL");
  for (const line of formatProductionRuntimeIssues(issues)) console.error(`- ${line}`);
  process.exitCode = 1;
} else {
  console.log("Production runtime preflight: PASS");
  console.log("Required production runtime variables are present and structurally valid.");
}
