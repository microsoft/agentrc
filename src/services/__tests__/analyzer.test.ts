import fs from "fs/promises";
import os from "os";
import path from "path";

import {
  analyzeRepo,
  loadAgentrcConfig,
  sanitizeAreaName,
  detectWorkspaces,
  type Area
} from "@agentrc/core/services/analyzer";
import {
  buildAreaFrontmatter,
  buildAreaInstructionContent,
  areaInstructionPath,
  writeAreaInstruction
} from "@agentrc/core/services/instructions";
import { afterEach, describe, expect, it } from "vitest";

describe("analyzeRepo", () => {
  const tmpDirs: string[] = [];

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-test-"));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDirs.length = 0;
  });

  it("detects TypeScript and npm workspace", async () => {
    const repoPath = await makeTmpDir();
    const packageJson = {
      name: "demo",
      workspaces: ["packages/*"],
      dependencies: { react: "^19.0.0" }
    };

    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify(packageJson, null, 2));
    await fs.writeFile(path.join(repoPath, "tsconfig.json"), "{}", "utf8");
    await fs.mkdir(path.join(repoPath, "packages", "app"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "packages", "app", "package.json"),
      JSON.stringify({ name: "app", scripts: { build: "tsc" } }, null, 2)
    );

    const result = await analyzeRepo(repoPath);

    expect(result.languages).toContain("TypeScript");
    expect(result.workspaceType).toBe("npm");
    expect(result.apps?.length).toBe(1);
  });

  it("detects C# language", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "MyProject.csproj"), "<Project/>", "utf8");

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("C#");
  });

  it("detects Java via pom.xml", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "pom.xml"), "<project/>", "utf8");

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("Java");
    expect(result.packageManager).toBe("maven");
  });

  it("detects Java via build.gradle", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "build.gradle"), "plugins {}", "utf8");

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("Java");
    expect(result.packageManager).toBe("gradle");
  });

  it("detects Ruby", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "Gemfile"), "source 'https://rubygems.org'", "utf8");

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("Ruby");
    expect(result.packageManager).toBe("bundler");
  });

  it("detects PHP", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "composer.json"), "{}", "utf8");

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("PHP");
    expect(result.packageManager).toBe("composer");
  });

  it("returns empty analysis for empty directory", async () => {
    const repoPath = await makeTmpDir();

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toEqual([]);
    expect(result.frameworks).toEqual([]);
    expect(result.packageManager).toBeUndefined();
  });

  it("detects pnpm workspace with comments in YAML", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name: "root" }));
    await fs.writeFile(path.join(repoPath, "pnpm-lock.yaml"), "lockfileVersion: 9");
    await fs.writeFile(
      path.join(repoPath, "pnpm-workspace.yaml"),
      ["# workspace config", "packages:", "  - 'apps/*' # main apps", "  - 'libs/*'", "# end"].join(
        "\n"
      )
    );
    await fs.mkdir(path.join(repoPath, "apps", "web"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "apps", "web", "package.json"),
      JSON.stringify({ name: "web", scripts: { build: "tsc" } })
    );

    const result = await analyzeRepo(repoPath);
    expect(result.workspaceType).toBe("pnpm");
    expect(result.workspacePatterns).toContain("apps/*");
    expect(result.workspacePatterns).toContain("libs/*");
    // Should not include comment text in patterns
    expect(result.workspacePatterns?.some((p) => p.includes("#"))).toBe(false);
  });

  it("detects pnpm inline array workspace", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name: "root" }));
    await fs.writeFile(path.join(repoPath, "pnpm-lock.yaml"), "lockfileVersion: 9");
    await fs.writeFile(
      path.join(repoPath, "pnpm-workspace.yaml"),
      'packages: ["apps/*", "libs/*"]\n'
    );

    const result = await analyzeRepo(repoPath);
    expect(result.workspaceType).toBe("pnpm");
    expect(result.workspacePatterns).toContain("apps/*");
    expect(result.workspacePatterns).toContain("libs/*");
  });

  it("detects Cargo workspace (Rust monorepo)", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "Cargo.toml"),
      [
        "[workspace]",
        'members = ["crates/core", "crates/cli"]',
        "",
        "[package]",
        'name = "root"'
      ].join("\n")
    );
    await fs.mkdir(path.join(repoPath, "crates", "core"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "crates", "core", "Cargo.toml"),
      '[package]\nname = "my-core"\nversion = "0.1.0"'
    );
    await fs.mkdir(path.join(repoPath, "crates", "cli"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "crates", "cli", "Cargo.toml"),
      '[package]\nname = "my-cli"\nversion = "0.1.0"'
    );

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("Rust");
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceType).toBe("cargo");
    expect(result.apps?.length).toBe(2);
    expect(result.apps?.map((a) => a.name).sort()).toEqual(["my-cli", "my-core"]);
    expect(result.apps?.[0].ecosystem).toBe("rust");
  });

  it("detects Go workspace (go.work)", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "go.work"),
      ["go 1.21", "", "use (", "    ./cmd/server", "    ./pkg/lib", ")"].join("\n")
    );
    await fs.mkdir(path.join(repoPath, "cmd", "server"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "cmd", "server", "go.mod"),
      "module github.com/example/server\n\ngo 1.21"
    );
    await fs.mkdir(path.join(repoPath, "pkg", "lib"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "pkg", "lib", "go.mod"),
      "module github.com/example/lib\n\ngo 1.21"
    );

    const result = await analyzeRepo(repoPath);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceType).toBe("go");
    expect(result.apps?.length).toBe(2);
    expect(result.apps?.map((a) => a.name).sort()).toEqual(["lib", "server"]);
    expect(result.apps?.[0].ecosystem).toBe("go");
  });

  it("detects .NET solution (monorepo)", async () => {
    const repoPath = await makeTmpDir();
    const slnContent = [
      "Microsoft Visual Studio Solution File, Format Version 12.00",
      "# Visual Studio Version 17",
      'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "WebApp", "src\\WebApp\\WebApp.csproj", "{GUID1}"',
      "EndProject",
      'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "CoreLib", "src\\CoreLib\\CoreLib.csproj", "{GUID2}"',
      "EndProject"
    ].join("\n");
    await fs.writeFile(path.join(repoPath, "MySolution.sln"), slnContent);
    await fs.mkdir(path.join(repoPath, "src", "WebApp"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "src", "WebApp", "WebApp.csproj"), "<Project/>");
    await fs.mkdir(path.join(repoPath, "src", "CoreLib"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "src", "CoreLib", "CoreLib.csproj"), "<Project/>");

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("C#");
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceType).toBe("dotnet");
    expect(result.apps?.length).toBe(2);
    expect(result.apps?.map((a) => a.name).sort()).toEqual(["CoreLib", "WebApp"]);
    expect(result.apps?.[0].ecosystem).toBe("dotnet");
  });

  it("detects .NET solution with .slnx format (monorepo)", async () => {
    const repoPath = await makeTmpDir();
    const slnxContent = [
      "<Solution>",
      '  <Folder Name="/src/">',
      '    <Project Path="src/WebApp/WebApp.csproj" />',
      '    <Project Path="src/CoreLib/CoreLib.csproj" Type="{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}" />',
      "  </Folder>",
      "</Solution>"
    ].join("\n");
    await fs.writeFile(path.join(repoPath, "MySolution.slnx"), slnxContent);
    await fs.mkdir(path.join(repoPath, "src", "WebApp"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "src", "WebApp", "WebApp.csproj"), "<Project/>");
    await fs.mkdir(path.join(repoPath, "src", "CoreLib"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "src", "CoreLib", "CoreLib.csproj"), "<Project/>");

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("C#");
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceType).toBe("dotnet");
    expect(result.apps?.length).toBe(2);
    expect(result.apps?.map((a) => a.name).sort()).toEqual(["CoreLib", "WebApp"]);
    expect(result.apps?.[0].ecosystem).toBe("dotnet");
    expect(result.packageManager).toBe("nuget");
  });

  it("detects F# language via .fsproj", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "MyProject.fsproj"),
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>'
    );

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("F#");
    expect(result.frameworks).toContain("Console");
  });

  it("detects .NET via global.json", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "global.json"),
      JSON.stringify({ sdk: { version: "8.0.100" } })
    );

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("C#");
  });

  it("detects ASP.NET Core framework from csproj", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "WebApp.csproj"),
      '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>'
    );

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("C#");
    expect(result.frameworks).toContain("ASP.NET Core");
  });

  it("detects xUnit test framework from csproj", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "Tests.csproj"),
      [
        '<Project Sdk="Microsoft.NET.Sdk">',
        "  <ItemGroup>",
        '    <PackageReference Include="xunit" Version="2.5.0" />',
        '    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.8.0" />',
        "  </ItemGroup>",
        "</Project>"
      ].join("\n")
    );

    const result = await analyzeRepo(repoPath);
    expect(result.frameworks).toContain("xUnit");
    expect(result.frameworks).not.toContain("MSTest");
  });

  it("detects both C# and F# in mixed repo", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "App.csproj"),
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>'
    );
    await fs.writeFile(
      path.join(repoPath, "Lib.fsproj"),
      '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>'
    );

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("C#");
    expect(result.languages).toContain("F#");
  });

  it("detects packages.lock.json as nuget", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "packages.lock.json"), "{}");

    const result = await analyzeRepo(repoPath);
    expect(result.packageManager).toBe("nuget");
  });

  it("detects Gradle multi-project", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "settings.gradle"),
      "rootProject.name = 'my-app'\ninclude ':app', ':lib'"
    );
    await fs.writeFile(path.join(repoPath, "build.gradle"), "plugins {}", "utf8");
    await fs.mkdir(path.join(repoPath, "app"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "app", "build.gradle"), "plugins {}");
    await fs.mkdir(path.join(repoPath, "lib"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "lib", "build.gradle"), "plugins {}");

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("Java");
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceType).toBe("gradle");
    expect(result.apps?.length).toBe(2);
    expect(result.apps?.map((a) => a.name).sort()).toEqual(["app", "lib"]);
    expect(result.apps?.[0].ecosystem).toBe("java");
  });

  it("detects Gradle Kotlin DSL multi-project", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "settings.gradle.kts"),
      'rootProject.name = "my-app"\ninclude(":app", ":server")'
    );
    await fs.writeFile(path.join(repoPath, "build.gradle.kts"), "plugins {}", "utf8");
    await fs.mkdir(path.join(repoPath, "app"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "app", "build.gradle.kts"), "plugins {}");
    await fs.mkdir(path.join(repoPath, "server"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "server", "build.gradle.kts"), "plugins {}");

    const result = await analyzeRepo(repoPath);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceType).toBe("gradle");
    expect(result.apps?.length).toBe(2);
    expect(result.apps?.map((a) => a.name).sort()).toEqual(["app", "server"]);
  });

  it("detects Maven multi-module", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "pom.xml"),
      [
        "<project>",
        "  <modules>",
        "    <module>api</module>",
        "    <module>web</module>",
        "  </modules>",
        "</project>"
      ].join("\n")
    );
    await fs.mkdir(path.join(repoPath, "api"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "api", "pom.xml"), "<project/>");
    await fs.mkdir(path.join(repoPath, "web"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "web", "pom.xml"), "<project/>");

    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("Java");
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceType).toBe("maven");
    expect(result.apps?.length).toBe(2);
    expect(result.apps?.map((a) => a.name).sort()).toEqual(["api", "web"]);
  });

  it("sets ecosystem to node for JS workspace apps", async () => {
    const repoPath = await makeTmpDir();
    const packageJson = {
      name: "demo",
      workspaces: ["packages/*"]
    };
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify(packageJson));
    await fs.mkdir(path.join(repoPath, "packages", "a"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "packages", "a", "package.json"),
      JSON.stringify({ name: "a" })
    );
    await fs.mkdir(path.join(repoPath, "packages", "b"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "packages", "b", "package.json"),
      JSON.stringify({ name: "b" })
    );

    const result = await analyzeRepo(repoPath);
    expect(result.isMonorepo).toBe(true);
    expect(result.apps?.[0].ecosystem).toBe("node");
    expect(result.apps?.[0].manifestPath).toBeTruthy();
  });

  it("detects areas from heuristic directories", async () => {
    const repoPath = await makeTmpDir();

    // Create heuristic dirs with meaningful content
    await fs.mkdir(path.join(repoPath, "frontend"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "frontend", "index.ts"), "export {};");
    await fs.mkdir(path.join(repoPath, "backend"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "backend", "package.json"), "{}");

    // Empty dir should be skipped
    await fs.mkdir(path.join(repoPath, "docs"), { recursive: true });

    // Non-heuristic dir should be skipped
    await fs.mkdir(path.join(repoPath, "random"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "random", "file.ts"), "export {};");

    const result = await analyzeRepo(repoPath);
    const areaNames = (result.areas ?? []).map((a) => a.name).sort();
    expect(areaNames).toContain("frontend");
    expect(areaNames).toContain("backend");
    expect(areaNames).not.toContain("docs");
    expect(areaNames).not.toContain("random");
  });

  it("detects areas from monorepo apps", async () => {
    const repoPath = await makeTmpDir();
    const packageJson = { name: "root", workspaces: ["packages/*"] };
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify(packageJson));
    await fs.mkdir(path.join(repoPath, "packages", "web"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "packages", "web", "package.json"),
      JSON.stringify({ name: "web" })
    );
    await fs.mkdir(path.join(repoPath, "packages", "api"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "packages", "api", "package.json"),
      JSON.stringify({ name: "api" })
    );

    const result = await analyzeRepo(repoPath);
    expect(result.isMonorepo).toBe(true);
    expect(result.areas?.length).toBe(2);
    const areaNames = (result.areas ?? []).map((a) => a.name).sort();
    expect(areaNames).toEqual(["api", "web"]);
    expect(result.areas?.[0].source).toBe("auto");
    expect(result.areas?.[0].applyTo).toMatch(/\*\*$/u);
  });

  it("config areas override auto-detected (case-insensitive)", async () => {
    const repoPath = await makeTmpDir();

    // Create a heuristic area
    await fs.mkdir(path.join(repoPath, "frontend"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "frontend", "index.ts"), "export {};");

    // Config overrides "frontend" with different applyTo
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        areas: [{ name: "Frontend", applyTo: "src/frontend/**", description: "UI layer" }]
      })
    );

    const result = await analyzeRepo(repoPath);
    const frontendArea = result.areas?.find((a) => a.name === "Frontend");
    expect(frontendArea).toBeDefined();
    expect(frontendArea?.source).toBe("config");
    expect(frontendArea?.applyTo).toBe("src/frontend/**");
    expect(frontendArea?.description).toBe("UI layer");
    // Should not have duplicate "frontend" (auto) + "Frontend" (config)
    const frontendAreas = (result.areas ?? []).filter((a) => a.name.toLowerCase() === "frontend");
    expect(frontendAreas.length).toBe(1);
  });

  it("returns empty areas for empty directory", async () => {
    const repoPath = await makeTmpDir();
    const result = await analyzeRepo(repoPath);
    expect(result.areas).toEqual([]);
  });

  it("preserves scripts and hasTsConfig from app to area", async () => {
    const repoPath = await makeTmpDir();
    const packageJson = { name: "root", workspaces: ["packages/*"] };
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify(packageJson));
    await fs.mkdir(path.join(repoPath, "packages", "web"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "packages", "web", "package.json"),
      JSON.stringify({ name: "web", scripts: { build: "next build", test: "jest" } })
    );
    await fs.writeFile(path.join(repoPath, "packages", "web", "tsconfig.json"), "{}");
    // Need 2 apps for monorepo detection
    await fs.mkdir(path.join(repoPath, "packages", "api"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "packages", "api", "package.json"),
      JSON.stringify({ name: "api", scripts: { start: "node index.js" } })
    );

    const result = await analyzeRepo(repoPath);
    expect(result.isMonorepo).toBe(true);
    const webArea = result.areas?.find((a) => a.name === "web");
    expect(webArea).toBeDefined();
    expect(webArea?.scripts?.build).toBe("next build");
    expect(webArea?.scripts?.test).toBe("jest");
    expect(webArea?.hasTsConfig).toBe(true);
  });

  it("reads scripts from heuristic area with package.json", async () => {
    const repoPath = await makeTmpDir();
    await fs.mkdir(path.join(repoPath, "frontend"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "frontend", "package.json"),
      JSON.stringify({ name: "frontend", scripts: { build: "vite build", test: "vitest" } })
    );
    await fs.writeFile(path.join(repoPath, "frontend", "tsconfig.json"), "{}");

    const result = await analyzeRepo(repoPath);
    const frontendArea = result.areas?.find((a) => a.name === "frontend");
    expect(frontendArea).toBeDefined();
    expect(frontendArea?.scripts?.build).toBe("vite build");
    expect(frontendArea?.hasTsConfig).toBe(true);
  });

  it("heuristic area without package.json has undefined scripts", async () => {
    const repoPath = await makeTmpDir();
    await fs.mkdir(path.join(repoPath, "frontend"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "frontend", "index.ts"), "export {};");

    const result = await analyzeRepo(repoPath);
    const frontendArea = result.areas?.find((a) => a.name === "frontend");
    expect(frontendArea).toBeDefined();
    expect(frontendArea?.scripts).toBeUndefined();
    expect(frontendArea?.hasTsConfig).toBeUndefined();
  });

  it("rejects config areas with path traversal", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        areas: [
          { name: "escape", applyTo: "../../etc/**" },
          { name: "safe", applyTo: "src/**" }
        ]
      })
    );
    const result = await analyzeRepo(repoPath);
    const areaNames = (result.areas ?? []).map((a) => a.name);
    expect(areaNames).not.toContain("escape");
    expect(areaNames).toContain("safe");
  });

  it("enriches config areas with scripts and hasTsConfig", async () => {
    const repoPath = await makeTmpDir();
    await fs.mkdir(path.join(repoPath, "api"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "api", "package.json"),
      JSON.stringify({ name: "api", scripts: { build: "tsc", test: "jest" } })
    );
    await fs.writeFile(path.join(repoPath, "api", "tsconfig.json"), "{}");
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({ areas: [{ name: "API", applyTo: "api/**" }] })
    );
    const result = await analyzeRepo(repoPath);
    const apiArea = result.areas?.find((a) => a.name === "API");
    expect(apiArea).toBeDefined();
    expect(apiArea?.source).toBe("config");
    expect(apiArea?.scripts?.build).toBe("tsc");
    expect(apiArea?.hasTsConfig).toBe(true);
  });

  it("propagates parentArea from config to detected areas", async () => {
    const repoPath = await makeTmpDir();
    await fs.mkdir(path.join(repoPath, "api"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "api", "package.json"), JSON.stringify({ name: "api" }));
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        areas: [
          { name: "root", applyTo: "src/**" },
          { name: "API", applyTo: "api/**", parentArea: "root" }
        ]
      })
    );
    const result = await analyzeRepo(repoPath);
    const apiArea = result.areas?.find((a) => a.name === "API");
    expect(apiArea).toBeDefined();
    expect(apiArea?.parentArea).toBe("root");
  });

  it("detects C++ language from CMakeLists.txt", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "CMakeLists.txt"),
      "cmake_minimum_required(VERSION 3.20)"
    );
    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("C++");
  });

  it("detects C++ language from moz.build", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "moz.build"), "DIRS += ['dom']");
    const result = await analyzeRepo(repoPath);
    expect(result.languages).toContain("C++");
  });

  it("detects Turborepo overlay on npm workspaces", async () => {
    const repoPath = await makeTmpDir();
    const packageJson = { name: "root", workspaces: ["packages/*"] };
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify(packageJson));
    await fs.writeFile(path.join(repoPath, "turbo.json"), JSON.stringify({ pipeline: {} }));
    await fs.mkdir(path.join(repoPath, "packages", "web"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "packages", "web", "package.json"),
      JSON.stringify({ name: "web" })
    );
    await fs.mkdir(path.join(repoPath, "packages", "api"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "packages", "api", "package.json"),
      JSON.stringify({ name: "api" })
    );

    const result = await analyzeRepo(repoPath);
    expect(result.workspaceType).toBe("turborepo");
    expect(result.isMonorepo).toBe(true);
    expect(result.apps?.length).toBe(2);
  });

  it("detects Bazel workspace with MODULE.bazel", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "MODULE.bazel"), 'module(name = "myproject")');

    await fs.mkdir(path.join(repoPath, "server"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "server", "BUILD"), 'java_binary(name = "server")');
    await fs.mkdir(path.join(repoPath, "client"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "client", "BUILD.bazel"),
      'java_binary(name = "client")'
    );
    // Dir without BUILD file should be skipped
    await fs.mkdir(path.join(repoPath, "docs"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "docs", "README.md"), "# docs");

    const result = await analyzeRepo(repoPath);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceType).toBe("bazel");
    expect(result.apps?.length).toBe(2);
    expect(result.apps?.map((a) => a.name).sort()).toEqual(["client", "server"]);
    const clientApp = result.apps?.find((a) => a.name === "client");
    expect(clientApp?.manifestPath).toBe(path.join(repoPath, "client", "BUILD.bazel"));
    expect(clientApp?.ecosystem).toBeUndefined();
    const serverApp = result.apps?.find((a) => a.name === "server");
    expect(serverApp?.manifestPath).toBe(path.join(repoPath, "server", "BUILD"));
  });

  it("detects Bazel workspace with WORKSPACE.bazel file", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "WORKSPACE.bazel"), 'workspace(name = "myproject")');

    await fs.mkdir(path.join(repoPath, "lib"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "lib", "BUILD"), 'cc_library(name = "lib")');
    await fs.mkdir(path.join(repoPath, "bin"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "bin", "BUILD"), 'cc_binary(name = "bin")');

    const result = await analyzeRepo(repoPath);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceType).toBe("bazel");
    expect(result.packageManager).toBe("bazel");
  });

  it("prioritizes Nx workspaceType for JS workspaces when nx.json exists", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "nx.json"), JSON.stringify({ npmScope: "myorg" }));
    await fs.writeFile(
      path.join(repoPath, "package.json"),
      JSON.stringify({ name: "root", workspaces: ["packages/*"] })
    );
    await fs.mkdir(path.join(repoPath, "packages", "app"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "packages", "app", "package.json"),
      JSON.stringify({ name: "app" })
    );
    await fs.mkdir(path.join(repoPath, "packages", "lib"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "packages", "lib", "package.json"),
      JSON.stringify({ name: "lib" })
    );

    const result = await analyzeRepo(repoPath);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceType).toBe("nx");
    expect(result.apps?.map((a) => a.name).sort()).toEqual(["app", "lib"]);
  });

  it("detects Nx workspace with project.json files", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "nx.json"), JSON.stringify({ npmScope: "myorg" }));
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name: "root" }));

    await fs.mkdir(path.join(repoPath, "apps", "web"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "apps", "web", "project.json"),
      JSON.stringify({ name: "web", projectType: "application" })
    );
    await fs.writeFile(
      path.join(repoPath, "apps", "web", "package.json"),
      JSON.stringify({ name: "web" })
    );
    await fs.writeFile(path.join(repoPath, "apps", "web", "tsconfig.json"), "{}");

    await fs.mkdir(path.join(repoPath, "libs", "shared"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "libs", "shared", "project.json"),
      JSON.stringify({ name: "shared", projectType: "library" })
    );

    const result = await analyzeRepo(repoPath);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceType).toBe("nx");
    expect(result.apps?.length).toBe(2);
    expect(result.apps?.map((a) => a.name).sort()).toEqual(["shared", "web"]);
    const webApp = result.apps?.find((a) => a.name === "web");
    expect(webApp?.ecosystem).toBe("node");
    expect(webApp?.hasTsConfig).toBe(true);
  });

  it("detects Pants workspace with pants.toml and BUILD files", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "pants.toml"), '[GLOBAL]\npants_version = "2.18.0"');

    await fs.mkdir(path.join(repoPath, "src"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "src", "BUILD"), "python_sources()");
    await fs.writeFile(path.join(repoPath, "src", "pyproject.toml"), "[project]");

    await fs.mkdir(path.join(repoPath, "tests"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "tests", "BUILD.pants"), "python_tests()");

    const result = await analyzeRepo(repoPath);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaceType).toBe("pants");
    expect(result.apps?.length).toBe(2);
    expect(result.packageManager).toBe("pants");
    const srcApp = result.apps?.find((a) => a.name === "src");
    expect(srcApp?.ecosystem).toBe("python");
    expect(srcApp?.manifestPath).toBe(path.join(repoPath, "src", "BUILD"));
    const testsApp = result.apps?.find((a) => a.name === "tests");
    expect(testsApp?.manifestPath).toBe(path.join(repoPath, "tests", "BUILD.pants"));
    expect(testsApp?.ecosystem).toBeUndefined();
  });

  it("smart fallback detects areas in large repos", async () => {
    const repoPath = await makeTmpDir();

    // Create 12+ top-level dirs to trigger fallback (threshold: >10 dirs, <3 areas)
    // Use names NOT in AREA_HEURISTIC_DIRS so heuristics won't find them
    const dirs = [
      "gfx",
      "netwerk",
      "ipc",
      "intl",
      "caps",
      "chrome",
      "widget",
      "accessible",
      "parser",
      "image",
      "hal",
      "uriloader"
    ];
    for (const dir of dirs) {
      await fs.mkdir(path.join(repoPath, dir), { recursive: true });
      // Add enough children (>= 3) and code files/manifests
      await fs.writeFile(path.join(repoPath, dir, "moz.build"), "DIRS += []");
      await fs.writeFile(path.join(repoPath, dir, "README.md"), `# ${dir}`);
      await fs.writeFile(path.join(repoPath, dir, "main.cpp"), "int main() {}");
    }

    const result = await analyzeRepo(repoPath);
    const areaNames = (result.areas ?? []).map((a) => a.name);
    // Fallback should detect these non-standard dirs
    expect(areaNames).toContain("gfx");
    expect(areaNames).toContain("netwerk");
    expect(areaNames).toContain("ipc");
    expect(areaNames).toContain("intl");
    expect(areaNames).toContain("caps");
    // Verify we got a good number of areas
    expect(result.areas?.length).toBeGreaterThanOrEqual(10);
  });

  it("smart fallback skips hidden dirs and known skip dirs", async () => {
    const repoPath = await makeTmpDir();

    // Create enough dirs to trigger fallback
    const contentDirs = [
      "aaa",
      "bbb",
      "ccc",
      "ddd",
      "eee",
      "fff",
      "ggg",
      "hhh",
      "iii",
      "jjj",
      "kkk"
    ];
    for (const dir of contentDirs) {
      await fs.mkdir(path.join(repoPath, dir), { recursive: true });
      await fs.writeFile(path.join(repoPath, dir, "index.ts"), "export {};");
      await fs.writeFile(path.join(repoPath, dir, "util.ts"), "export {};");
      await fs.writeFile(path.join(repoPath, dir, "types.ts"), "export {};");
    }

    // These should be skipped
    await fs.mkdir(path.join(repoPath, ".hidden"), { recursive: true });
    await fs.writeFile(path.join(repoPath, ".hidden", "file.ts"), "export {};");
    await fs.mkdir(path.join(repoPath, "node_modules"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "node_modules", "pkg.js"), "");
    await fs.mkdir(path.join(repoPath, "third_party"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "third_party", "lib.c"), "");

    const result = await analyzeRepo(repoPath);
    const areaNames = (result.areas ?? []).map((a) => a.name);
    expect(areaNames).not.toContain(".hidden");
    expect(areaNames).not.toContain("node_modules");
    expect(areaNames).not.toContain("third_party");
  });

  it("fallback does not trigger for small repos", async () => {
    const repoPath = await makeTmpDir();

    // Only 3 top-level dirs — should NOT trigger fallback
    await fs.mkdir(path.join(repoPath, "custom1"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "custom1", "main.py"), "print('hi')");
    await fs.mkdir(path.join(repoPath, "custom2"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "custom2", "main.py"), "print('hi')");
    await fs.mkdir(path.join(repoPath, "custom3"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "custom3", "main.py"), "print('hi')");

    const result = await analyzeRepo(repoPath);
    const areaNames = (result.areas ?? []).map((a) => a.name);
    // custom1, custom2, custom3 are not in heuristic list and repo is small
    expect(areaNames).not.toContain("custom1");
  });
});

describe("loadAgentrcConfig", () => {
  const tmpDirs: string[] = [];

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-config-"));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDirs.length = 0;
  });

  it("returns undefined when no config exists", async () => {
    const repoPath = await makeTmpDir();
    expect(await loadAgentrcConfig(repoPath)).toBeUndefined();
  });

  it("loads config from repo root", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({ areas: [{ name: "api", applyTo: "src/api/**" }] })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.areas?.length).toBe(1);
    expect(config?.areas?.[0].name).toBe("api");
  });

  it("loads config from .github/", async () => {
    const repoPath = await makeTmpDir();
    await fs.mkdir(path.join(repoPath, ".github"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, ".github", "agentrc.config.json"),
      JSON.stringify({ areas: [{ name: "web", applyTo: ["web/**"] }] })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.areas?.length).toBe(1);
  });

  it("ignores malformed areas (missing name or applyTo)", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        areas: [
          { name: "good", applyTo: "src/**" },
          { description: "no name" },
          { name: "no-apply" },
          "not-an-object"
        ]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.areas?.length).toBe(1);
    expect(config?.areas?.[0].name).toBe("good");
  });

  it("rejects applyTo patterns with path traversal segments", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        areas: [
          { name: "escape", applyTo: "../../etc/**" },
          { name: "good", applyTo: "src/**" }
        ]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.areas?.length).toBe(1);
    expect(config?.areas?.[0].name).toBe("good");
  });

  it("returns undefined for non-array areas", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({ areas: "oops" })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config).toBeUndefined();
  });

  it("parses policies array from config", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        areas: [{ name: "api", applyTo: "src/api/**" }],
        policies: ["./custom-policy.json", "@org/policy-pkg"]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.policies).toEqual(["./custom-policy.json", "@org/policy-pkg"]);
    expect(config?.areas).toHaveLength(1);
  });

  it("filters out non-string and empty policy entries", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        policies: ["valid", 42, "", "  ", null, "also-valid"]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.policies).toEqual(["valid", "also-valid"]);
  });

  it("returns undefined policies when field is absent", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({ areas: [{ name: "web", applyTo: "web/**" }] })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.policies).toBeUndefined();
  });

  it("parses strategy field", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({ strategy: "nested", areas: [{ name: "web", applyTo: "web/**" }] })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.strategy).toBe("nested");
  });

  it("ignores invalid strategy values", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({ strategy: "invalid", areas: [{ name: "web", applyTo: "web/**" }] })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.strategy).toBeUndefined();
  });

  it("parses detailDir field", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({ detailDir: "docs-ai", areas: [{ name: "web", applyTo: "web/**" }] })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.detailDir).toBe("docs-ai");
  });

  it("rejects detailDir with path traversal", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({ detailDir: "../etc", areas: [{ name: "web", applyTo: "web/**" }] })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.detailDir).toBeUndefined();
  });

  it("rejects absolute detailDir", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({ detailDir: "/tmp/evil", areas: [{ name: "web", applyTo: "web/**" }] })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.detailDir).toBeUndefined();
  });

  it("rejects detailDir in blocklist", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({ detailDir: "node_modules", areas: [{ name: "web", applyTo: "web/**" }] })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.detailDir).toBeUndefined();
  });

  it("rejects detailDir with backslash traversal", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({ detailDir: "..\\..\\etc", areas: [{ name: "web", applyTo: "web/**" }] })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.detailDir).toBeUndefined();
  });

  it("rejects multi-segment detailDir", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({ detailDir: "docs/agents", areas: [{ name: "web", applyTo: "web/**" }] })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.detailDir).toBeUndefined();
  });

  it("parses claudeMd boolean", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({ claudeMd: true, areas: [{ name: "web", applyTo: "web/**" }] })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.claudeMd).toBe(true);
  });

  it("ignores non-boolean claudeMd", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({ claudeMd: "yes", areas: [{ name: "web", applyTo: "web/**" }] })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.claudeMd).toBeUndefined();
  });

  it("validates parentArea references existing area", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        areas: [
          { name: "root", applyTo: "src/**" },
          { name: "child", applyTo: "src/child/**", parentArea: "root" }
        ]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    const child = config?.areas?.find((a) => a.name === "child");
    expect(child?.parentArea).toBe("root");
  });

  it("clears invalid parentArea references", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        areas: [{ name: "child", applyTo: "src/child/**", parentArea: "nonexistent" }]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    const child = config?.areas?.find((a) => a.name === "child");
    expect(child?.parentArea).toBeUndefined();
  });
});

describe("sanitizeAreaName", () => {
  it("lowercases and replaces non-alphanumeric chars", () => {
    expect(sanitizeAreaName("My App")).toBe("my-app");
    expect(sanitizeAreaName("frontend/api")).toBe("frontend-api");
  });

  it("collapses multiple dashes", () => {
    expect(sanitizeAreaName("my--app---name")).toBe("my-app-name");
  });

  it("strips leading and trailing dashes", () => {
    expect(sanitizeAreaName("-hello-")).toBe("hello");
    expect(sanitizeAreaName("@scope/pkg")).toBe("scope-pkg");
  });

  it("returns 'unnamed' for empty result", () => {
    expect(sanitizeAreaName("@#$")).toBe("unnamed");
    expect(sanitizeAreaName("")).toBe("unnamed");
    expect(sanitizeAreaName("---")).toBe("unnamed");
  });
});

describe("buildAreaFrontmatter", () => {
  it("generates frontmatter with single applyTo", () => {
    const area: Area = { name: "api", applyTo: "api/**", source: "auto" };
    const fm = buildAreaFrontmatter(area);
    expect(fm).toContain('applyTo: "api/**"');
    expect(fm).toContain('description: "Use when working on api"');
    expect(fm).toMatch(/^---\n/u);
    expect(fm).toMatch(/\n---$/u);
  });

  it("generates frontmatter with array applyTo", () => {
    const area: Area = { name: "web", applyTo: ["src/web/**", "public/**"], source: "auto" };
    const fm = buildAreaFrontmatter(area);
    expect(fm).toContain('applyTo: ["src/web/**", "public/**"]');
  });

  it("includes description when provided", () => {
    const area: Area = {
      name: "ui",
      applyTo: "ui/**",
      description: "React components",
      source: "config"
    };
    const fm = buildAreaFrontmatter(area);
    expect(fm).toContain("Use when working on ui. React components");
  });

  it("escapes quotes in description", () => {
    const area: Area = {
      name: "api",
      applyTo: "api/**",
      description: 'uses "REST" style',
      source: "config"
    };
    const fm = buildAreaFrontmatter(area);
    expect(fm).toContain('uses \\"REST\\" style');
    expect(fm).not.toMatch(/[^\\]"REST"/u);
  });

  it("escapes quotes in applyTo patterns", () => {
    const area: Area = { name: "test", applyTo: 'src/"spec"/**', source: "auto" };
    const fm = buildAreaFrontmatter(area);
    expect(fm).toContain('src/\\"spec\\"/**');
  });

  it("escapes backslashes in description", () => {
    const area: Area = {
      name: "api",
      applyTo: "api/**",
      description: "path is C:\\Users",
      source: "config"
    };
    const fm = buildAreaFrontmatter(area);
    expect(fm).toContain("C:\\\\Users");
  });

  it("escapes newlines and tabs in description", () => {
    const area: Area = {
      name: "api",
      applyTo: "api/**",
      description: "line1\nline2\ttab",
      source: "config"
    };
    const fm = buildAreaFrontmatter(area);
    expect(fm).toContain("line1\\nline2\\ttab");
    expect(fm).not.toContain("\n" + "line2");
  });

  it("strips null bytes from description", () => {
    const area: Area = {
      name: "api",
      applyTo: "api/**",
      description: "clean\0value",
      source: "config"
    };
    const fm = buildAreaFrontmatter(area);
    expect(fm).toContain("cleanvalue");
    expect(fm).not.toContain("\0");
  });
});

describe("buildAreaInstructionContent", () => {
  it("wraps frontmatter and body", () => {
    const area: Area = { name: "api", applyTo: "api/**", source: "auto" };
    const content = buildAreaInstructionContent(area, "# API instructions\nUse REST.");
    expect(content).toMatch(/^---\n/u);
    expect(content).toContain("# API instructions");
    expect(content).toContain("Use REST.");
    expect(content).toMatch(/\n$/u);
  });
});

describe("areaInstructionPath", () => {
  it("returns path under .github/instructions/", () => {
    const area: Area = { name: "My App", applyTo: "my-app/**", source: "auto" };
    const p = areaInstructionPath("/repo", area);
    expect(p).toContain(".github");
    expect(p).toContain("instructions");
    expect(p).toContain("my-app.instructions.md");
  });

  it("sanitizes area name for filename", () => {
    const area: Area = { name: "@scope/pkg", applyTo: "pkg/**", source: "config" };
    const p = areaInstructionPath("/repo", area);
    expect(p).toContain("scope-pkg.instructions.md");
  });
});

describe("writeAreaInstruction", () => {
  const tmpDirs: string[] = [];

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-write-"));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDirs.length = 0;
  });

  it("returns empty status for blank body", async () => {
    const repoPath = await makeTmpDir();
    const area: Area = { name: "api", applyTo: "api/**", source: "auto" };
    const result = await writeAreaInstruction(repoPath, area, "  \n  ");
    expect(result.status).toBe("empty");
    // File should not be created
    await expect(fs.access(result.filePath)).rejects.toThrow();
  });

  it("writes file for new area", async () => {
    const repoPath = await makeTmpDir();
    const area: Area = { name: "api", applyTo: "api/**", source: "auto" };
    const result = await writeAreaInstruction(repoPath, area, "# API guide");
    expect(result.status).toBe("written");
    const content = await fs.readFile(result.filePath, "utf8");
    expect(content).toContain("# API guide");
    expect(content).toContain("applyTo:");
    expect(result.filePath).toContain("api.instructions.md");
  });

  it("skips when file exists and force is false", async () => {
    const repoPath = await makeTmpDir();
    const area: Area = { name: "api", applyTo: "api/**", source: "auto" };
    // Write first time
    await writeAreaInstruction(repoPath, area, "# Original");
    // Try again without force
    const result = await writeAreaInstruction(repoPath, area, "# Updated");
    expect(result.status).toBe("skipped");
    // Content should be unchanged
    const content = await fs.readFile(result.filePath, "utf8");
    expect(content).toContain("# Original");
  });

  it("overwrites when force is true", async () => {
    const repoPath = await makeTmpDir();
    const area: Area = { name: "api", applyTo: "api/**", source: "auto" };
    await writeAreaInstruction(repoPath, area, "# Original");
    const result = await writeAreaInstruction(repoPath, area, "# Updated", true);
    expect(result.status).toBe("written");
    const content = await fs.readFile(result.filePath, "utf8");
    expect(content).toContain("# Updated");
    expect(content).not.toContain("# Original");
  });
});

describe("loadAgentrcConfig workspaces", () => {
  const tmpDirs: string[] = [];

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-ws-"));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDirs.length = 0;
  });

  it("parses workspaces with areas", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        workspaces: [
          {
            name: "frontend",
            path: "packages/frontend",
            areas: [
              { name: "app", applyTo: "app/**" },
              { name: "shared", applyTo: ["shared/**", "common/**"], description: "Shared libs" }
            ]
          }
        ]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.workspaces).toHaveLength(1);
    expect(config?.workspaces?.[0].name).toBe("frontend");
    expect(config?.workspaces?.[0].path).toBe("packages/frontend");
    expect(config?.workspaces?.[0].areas).toHaveLength(2);
    expect(config?.workspaces?.[0].areas[1].description).toBe("Shared libs");
  });

  it("rejects workspaces with path traversal", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        workspaces: [
          {
            name: "evil",
            path: "../outside",
            areas: [{ name: "x", applyTo: "x/**" }]
          }
        ]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.workspaces).toBeUndefined();
  });

  it("rejects workspaces with absolute path", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        workspaces: [
          {
            name: "evil",
            path: "/tmp/bad",
            areas: [{ name: "x", applyTo: "x/**" }]
          }
        ]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.workspaces).toBeUndefined();
  });

  it("skips workspaces with no valid areas", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        workspaces: [
          {
            name: "empty",
            path: "packages/empty",
            areas: []
          }
        ]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.workspaces).toBeUndefined();
  });

  it("coexists flat areas and workspaces", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        areas: [{ name: "docs", applyTo: "docs/**" }],
        workspaces: [
          {
            name: "frontend",
            path: "packages/frontend",
            areas: [{ name: "app", applyTo: "app/**" }]
          }
        ]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.areas).toHaveLength(1);
    expect(config?.workspaces).toHaveLength(1);
  });

  it("rejects workspace with path '.'", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        workspaces: [
          {
            name: "root",
            path: ".",
            areas: [{ name: "x", applyTo: "x/**" }]
          }
        ]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.workspaces).toBeUndefined();
  });

  it("parses workspace with non-existent directory path", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        workspaces: [
          {
            name: "future",
            path: "packages/not-yet-created",
            areas: [{ name: "app", applyTo: "app/**" }]
          }
        ]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.workspaces).toHaveLength(1);
    expect(config?.workspaces?.[0].name).toBe("future");
  });

  it("skips malformed workspace entries", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        workspaces: [
          null,
          "not-an-object",
          { path: "no-name", areas: [{ name: "x", applyTo: "x/**" }] },
          { name: "no-path", areas: [{ name: "x", applyTo: "x/**" }] },
          { name: "  ", path: "blank-name", areas: [{ name: "x", applyTo: "x/**" }] },
          {
            name: "valid",
            path: "packages/valid",
            areas: [{ name: "app", applyTo: "app/**" }]
          }
        ]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    expect(config?.workspaces).toHaveLength(1);
    expect(config?.workspaces?.[0].name).toBe("valid");
  });

  it("rejects workspace area applyTo with traversal", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        workspaces: [
          {
            name: "ws",
            path: "packages/ws",
            areas: [{ name: "escape", applyTo: "../../etc/**" }]
          }
        ]
      })
    );
    const config = await loadAgentrcConfig(repoPath);
    // Area is rejected by parseConfigAreas, so workspace has no valid areas → dropped
    expect(config?.workspaces).toBeUndefined();
  });
});

describe("detectWorkspaces", () => {
  const tmpDirs: string[] = [];

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-dw-"));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDirs.length = 0;
  });

  it("detects workspace via .vscode folder", async () => {
    const repoPath = await makeTmpDir();
    // Create a subdirectory with a .vscode folder and a heuristic area inside it
    await fs.mkdir(path.join(repoPath, "packages", "frontend", ".vscode"), { recursive: true });
    await fs.mkdir(path.join(repoPath, "packages", "frontend", "app"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "packages", "frontend", "app", "index.ts"),
      "export {};"
    );

    const areas: Area[] = [];
    const workspaces = await detectWorkspaces(repoPath, areas);
    expect(workspaces).toHaveLength(1);
    const ws = workspaces.find((w) => w.path === "packages/frontend");
    expect(ws).toBeDefined();
    expect(ws!.name).toBe("frontend");
  });

  it("groups sibling areas into workspace by common parent", async () => {
    const repoPath = await makeTmpDir();
    const appPath = path.join(repoPath, "packages", "web", "app");
    const sharedPath = path.join(repoPath, "packages", "web", "shared");
    await fs.mkdir(appPath, { recursive: true });
    await fs.mkdir(sharedPath, { recursive: true });

    const areas: Area[] = [
      { name: "app", applyTo: "packages/web/app/**", path: appPath, source: "auto" },
      { name: "shared", applyTo: "packages/web/shared/**", path: sharedPath, source: "auto" }
    ];

    const workspaces = await detectWorkspaces(repoPath, areas);
    const ws = workspaces.find((w) => w.path === "packages/web");
    expect(ws).toBeDefined();
    expect(ws!.areas).toHaveLength(2);
  });

  it("converts area applyTo to workspace-relative patterns", async () => {
    const repoPath = await makeTmpDir();
    const appPath = path.join(repoPath, "mono", "app");
    const libPath = path.join(repoPath, "mono", "lib");
    await fs.mkdir(appPath, { recursive: true });
    await fs.mkdir(libPath, { recursive: true });

    const areas: Area[] = [
      { name: "app", applyTo: "mono/app/**", path: appPath, source: "auto" },
      { name: "lib", applyTo: "mono/lib/**", path: libPath, source: "auto" }
    ];

    const workspaces = await detectWorkspaces(repoPath, areas);
    const ws = workspaces.find((w) => w.path === "mono");
    expect(ws).toBeDefined();
    // applyTo should be workspace-relative
    const appArea = ws!.areas.find((a) => a.name === "app");
    expect(appArea?.applyTo).toBe("app/**");
  });

  it("skips repo root as workspace", async () => {
    const repoPath = await makeTmpDir();
    await fs.mkdir(path.join(repoPath, ".vscode"), { recursive: true });

    const areas: Area[] = [];
    const workspaces = await detectWorkspaces(repoPath, areas);
    // Root .vscode should not create a workspace entry
    expect(workspaces.filter((w) => w.path === "" || w.path === ".")).toHaveLength(0);
  });

  it("does not create workspace for single area in parent", async () => {
    const repoPath = await makeTmpDir();
    const appPath = path.join(repoPath, "packages", "solo");
    await fs.mkdir(appPath, { recursive: true });

    const areas: Area[] = [
      { name: "solo", applyTo: "packages/solo/**", path: appPath, source: "auto" }
    ];

    const workspaces = await detectWorkspaces(repoPath, areas);
    // Single area should not form a workspace from common-parent grouping
    expect(workspaces.filter((w) => w.path === "packages")).toHaveLength(0);
  });
});

describe("analyzeRepo with workspace config", () => {
  const tmpDirs: string[] = [];

  async function makeTmpDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "agentrc-wsarea-"));
    tmpDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDirs.length = 0;
  });

  it("flattens workspace areas with namespaced names and repo-relative applyTo", async () => {
    const repoPath = await makeTmpDir();
    // Minimal repo structure
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name: "mono" }));
    await fs.mkdir(path.join(repoPath, "packages", "frontend", "app"), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, "packages", "frontend", "app", "index.ts"),
      "export {};"
    );

    // agentrc config with workspaces
    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        workspaces: [
          {
            name: "frontend",
            path: "packages/frontend",
            areas: [{ name: "app", applyTo: "app/**" }]
          }
        ]
      })
    );

    const result = await analyzeRepo(repoPath);
    const wsArea = result.areas?.find((a) => a.name === "frontend/app");
    expect(wsArea).toBeDefined();
    expect(wsArea!.applyTo).toBe("packages/frontend/app/**");
    expect(wsArea!.workingDirectory).toBe("packages/frontend");
    expect(wsArea!.source).toBe("config");
  });

  it("rewrites array applyTo patterns to repo-relative", async () => {
    const repoPath = await makeTmpDir();
    await fs.writeFile(path.join(repoPath, "package.json"), JSON.stringify({ name: "mono" }));
    await fs.mkdir(path.join(repoPath, "packages", "ui", "app"), { recursive: true });
    await fs.writeFile(path.join(repoPath, "packages", "ui", "app", "index.ts"), "export {};");

    await fs.writeFile(
      path.join(repoPath, "agentrc.config.json"),
      JSON.stringify({
        workspaces: [
          {
            name: "ui",
            path: "packages/ui",
            areas: [{ name: "app", applyTo: ["app/**", "components/**"] }]
          }
        ]
      })
    );

    const result = await analyzeRepo(repoPath);
    const wsArea = result.areas?.find((a) => a.name === "ui/app");
    expect(wsArea).toBeDefined();
    expect(wsArea!.applyTo).toEqual(["packages/ui/app/**", "packages/ui/components/**"]);
    expect(wsArea!.workingDirectory).toBe("packages/ui");
  });
});
