#!/usr/bin/env bash
cd "$(dirname "$0")"
version="0.0.0"
if [[ -f VERSION ]]; then
  version="$(tr -d '\r' < VERSION | head -n 1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [[ -n "$version" ]] || version="0.0.0"
fi
echo ""
echo "剧戏台 ${version}"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "还没有检测到 Node.js。"
  echo "请先安装 Node.js（建议 20 或更新），装好后再运行 bash start.sh。"
  echo "下载页面： https://nodejs.org/"
  if command -v brew >/dev/null 2>&1; then
    echo "如果要用 Homebrew，请自己运行： brew install node"
  fi
  echo ""
  exit 1
fi
echo "剧戏台正在本机启动。"
echo "先直连 GitHub 看有没有新版本。连不上会再试公开镜像。仍不行或选择跳过，也会用现在这份打开。"
echo "请用浏览器打开： http://127.0.0.1:4173"
echo "关掉这个窗口，剧戏台就会停止。"
echo ""
exec node src/server/index.js
