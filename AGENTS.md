This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## 版本升级与更新日志规范

**触发条件**：当用户同时表达下面两层意思时触发（**不限定具体措辞**，语义相近即可）：

- A. 要修改版本号，并给出目标版本号；
- B. 要把本次改动记录到更新日志。

例如「更改版本号为 1.1.0，并将更改记录到更新日志」「版本号升到 1.1.0 并更新 changelog」「改成 1.1.0，更新日志也加上」等，都算触发。

触发后必须自动执行以下全部步骤，不要再逐项找用户确认：

1. 把 `src/constants/appInfo.ts` 里的 `APP_VERSION` 改为目标版本（形如 `v1.0.0`，带 `v` 前缀）。
2. 把 `app.json` 里的 `expo.version` 改为目标版本（形如 `1.0.0`，不带 `v` 前缀）。
3. 归纳本次对话中的功能变动，在 `src/constants/changelog.ts` 的 `CHANGELOG_DATA` **数组顶部**插入一条新记录（最新版本排在最前）。

**记录格式**（必须严格遵守）：

```
v x.x.x：
- 更新内容1
- 更新内容2
```

- 标题行由 `version` 字段渲染为 `v <version>：`。**不要**把标题写进 `items`，也**不要**在 `version` 里写 `v` 前缀或结尾冒号。
- 每条更新要点以 `- ` 开头，但 `items` 数组里**只写正文**，`- ` 前缀由 `src/app/changelog.tsx` 统一渲染。
- **条数：至少 1 条，不设上限**。但必须尽可能减少条目 —— 相同、相近的改动要**合并**为一条，让更新日志尽可能简洁清晰；不要为了凑数而拆条。
- 语言简洁扼要，面向用户描述「能做什么」或「修好了什么」，不要罗列实现细节或文件改动。

改完后按本文件顶部的约定跑 `npx tsc --noEmit` 与 `npx expo lint`。

**边界情况**：若用户**只**要求改版本号（只有 A，没提更新日志），则只执行步骤 1、2，然后主动问一句是否需要同步补一条更新日志，不要擅自往 `CHANGELOG_DATA` 里塞内容。

