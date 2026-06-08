# GEO Studio

GEO Studio 是一个生成式引擎优化工作台，用来生成 AI 搜索提问、GEO 内容文章、导出内容包，并可配合本地发布服务发布到知乎、头条、百家号、搜狐、公众号等平台。

## 当前结构

- `index.html`：静态网站入口，访问域名根路径时自动打开工作台。
- `geo-studio.html`：前端单页工作台，适合直接放到 CloudBase 静态网站托管。
- `geo-publisher/`：可选的本地 Node 发布服务，用于调用浏览器自动发布内容。
- `pdd商品图/`：项目配套的商品图素材。
- `make_pdd_images.py`：商品图生成脚本。

## 本地打开

直接用浏览器打开：

```text
index.html
```

或者直接打开：

```text
geo-studio.html
```

## 可选：启动本地发布服务

发布服务会在本机保存平台账号配置和 Cookie，不建议直接公开部署到公网。

```bash
cd geo-publisher
npm install
npm start
```

服务默认地址：

```text
http://localhost:3001
```

## 域名部署建议

建议绑定一个独立子域名：

```text
geo.miaomiaoxiaoxianer.cn
```

静态托管只需要上传以下内容：

- `index.html`
- `geo-studio.html`
- `pdd商品图/`

`geo-publisher/` 建议先不要上传到静态网站托管，它是本地辅助服务，不是静态网页。
