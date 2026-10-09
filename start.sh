#!/usr/bin/env bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "还没有检测到 Node.js。"
  echo "这一步需要你自己完成：请先安装 Node.js（建议 20 或更新），装好后再运行 bash start.sh。"
  echo "下载页面： https://nodejs.org/"
  echo ""
  exit 1
fi
echo ""
echo "剧戏台正在本机启动。"
echo "请用浏览器打开： http://127.0.0.1:4173"
echo "关掉这个窗口，剧戏台就会停止。"
echo ""
exec node src/server/index.js
