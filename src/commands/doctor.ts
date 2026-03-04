import chalk from "chalk";

import type { CheckResult } from "../services/doctor";
import { runDoctorChecks } from "../services/doctor";
import type { CommandResult } from "../utils/output";
import { outputResult, shouldLog } from "../utils/output";

type DoctorOptions = {
  json?: boolean;
  quiet?: boolean;
  accessible?: boolean;
};

export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const { checks, hasFailures } = await runDoctorChecks();

  const result: CommandResult<{ checks: CheckResult[] }> = {
    ok: !hasFailures,
    status: hasFailures ? "error" : "success",
    data: { checks },
    errors: hasFailures
      ? checks.filter((c) => c.required && !c.ok).map((c) => `${c.name}: ${c.detail}`)
      : undefined
  };

  if (options.json) {
    outputResult(result, true);
    if (hasFailures) {
      process.exitCode = 1;
    }
    return;
  }

  if (shouldLog(options)) {
    const acc = options.accessible;
    process.stderr.write("\n  AgentRC Doctor\n\n");
    for (const check of checks) {
      const icon = check.ok
        ? acc
          ? chalk.green("OK")
          : chalk.green("✓")
        : acc
          ? chalk.red("FAIL")
          : chalk.red("✗");
      const label = check.ok ? check.name : chalk.red(check.name);
      const sep = acc ? " - " : " — ";
      process.stderr.write(`  ${icon} ${label}${sep}${check.detail}\n`);
      if (!check.ok && check.fix) {
        const arrow = acc ? chalk.dim("->") : chalk.dim("→");
        process.stderr.write(`    ${arrow} ${chalk.dim(check.fix)}\n`);
      }
    }
    process.stderr.write("\n");

    if (hasFailures) {
      process.stderr.write(
        chalk.red("  Some required checks failed. Fix the issues above and try again.\n\n")
      );
    } else {
      process.stderr.write(chalk.green("  All required checks passed!\n\n"));
    }
  }

  if (hasFailures) {
    process.exitCode = 1;
  }
}
