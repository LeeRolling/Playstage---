import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function filesUnder(dir) {
  return fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) return filesUnder(full);
    return /\.(js|css|html)$/.test(name) ? [full] : [];
  });
}

const domainForbidden = [
  /src\/ui/,
  /src\/server/,
  /\bdocument\b/,
  /\bwindow\b/,
  /\blocalStorage\b/,
  /\bfetch\s*\(/,
];

const uiForbidden = [/src\/domain/, /src\/server/, /\.\.\/domain/, /\.\.\/server/];

const problems = [];

for (const file of filesUnder(path.join(root, "src/domain"))) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of domainForbidden) {
    if (pattern.test(text)) problems.push(`${path.relative(root, file)} 碰到了界面或浏览器：${pattern}`);
  }
}

for (const file of filesUnder(path.join(root, "src/ui"))) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of uiForbidden) {
    if (pattern.test(text)) problems.push(`${path.relative(root, file)} 直接引用了功能层：${pattern}`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}

console.log("边界检查通过：功能层不碰界面，界面不引用功能层源码。");
