# Cloudflare 免费上线步骤

目标：不买服务器、不用付费磁盘，把网站部署到 Cloudflare Workers 免费额度内，给小范围用户访问。

## 你需要准备

- GitHub 仓库：`https://github.com/ta1zaI/hotspot-pulse`
- Cloudflare 账号
- 域名：`ta1zai.com`
- 一个后台管理员密码

## 第 1 步：安装依赖

```bash
npm install
```

## 第 2 步：登录 Cloudflare

```bash
npx wrangler login
```

浏览器会打开 Cloudflare 授权页面，登录并同意授权。

## 第 3 步：创建免费 D1 数据库

```bash
npx wrangler d1 create hotspot-pulse
```

命令会返回一个 `database_id`。把它复制到 `wrangler.toml` 的这里：

```toml
database_id = "REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID"
```

## 第 4 步：初始化数据库表

```bash
npx wrangler d1 execute hotspot-pulse --remote --file=./schema.sql
```

## 第 5 步：设置线上密钥

至少设置管理员密码：

```bash
npx wrangler secret put ADMIN_PASSWORD
```

如果要推送企业微信，再设置：

```bash
npx wrangler secret put WECOM_BOT_WEBHOOK
```

## 第 6 步：设置公开日报链接

```bash
npx wrangler secret put PUBLIC_DAILY_URL
```

值填写：

```text
https://ta1zai.com/daily.html
```

## 第 7 步：部署

```bash
npx wrangler deploy
```

部署成功后，Cloudflare 会给一个 `workers.dev` 临时地址。

## 第 8 步：绑定域名

在 Cloudflare Workers 的 Settings / Domains 里添加自定义域名：

```text
ta1zai.com
```

如果想保留根域给别的用途，也可以先绑定：

```text
hot.ta1zai.com
```

## 第 9 步：验收

逐项检查：

- 首页可以打开。
- `/daily.html` 可以打开。
- 管理员可以登录。
- 可以刷新热点。
- 可以保存日报。
- 刷新页面后日报不丢失。
- 过一段时间后定时刷新仍然工作。

## 免费额度注意事项

这个方案适合二三十个人的小范围使用。不要高频手动刷新热点，因为每次刷新会访问很多外部数据源，也会消耗 Worker 请求和 D1 写入额度。
