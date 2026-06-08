#!/bin/bash
echo "======================================"
echo "  GEO Studio 一键发布服务"
echo "======================================"

# 检查 Node.js
if ! command -v node &> /dev/null; then
  echo "❌ 未检测到 Node.js，请先安装：https://nodejs.org"
  exit 1
fi

# 安装依赖（仅首次）
if [ ! -d "node_modules" ]; then
  echo "📦 首次运行，正在安装依赖..."
  npm install
fi

echo ""
echo "🚀 启动发布服务..."
echo "📌 保持此窗口运行，然后打开 geo-studio.html 使用"
echo ""
node server.js
