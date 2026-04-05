import fs from "fs";
import path from "path";
import { generateWordCovers } from "./src/services/cover.ts";

const list = JSON.parse(fs.readFileSync("data/wordlists/test-001.json", "utf8"));
const word = list.words[0];
const result = generateWordCovers(
  list.id,
  word,
  path.resolve("public/images"),
  path.resolve("public/videos/background.mp4"),
);
console.log("COVER_OK", JSON.stringify(result));
