/**
 * 依存パッケージなしで core 層のテストを実行するための ESM ローダー。
 *
 * Node 22 は .ts を直接実行できるが、ESM の仕様上 import の指定子には
 * 拡張子が必要で、`from "./shared"` のような書き方は解決できない。
 * tsx などのツールを入れればよいが、core 層は外部依存を持たない方針なので、
 * 拡張子補完だけを行う最小のフックを自前で用意している。
 *
 *   node --import ./scripts/ts-loader.mjs --test src/core/__tests__/*.test.ts
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(pathToFileURL(new URL("./ts-resolve-hooks.mjs", import.meta.url).pathname));
