# Cloudflare 免费上线步骤

目标：不买服务器、不用付费磁盘，把网站部署到 Cloudflare Workers 免费额度内，使用子域名 `daily.ta1zai.com` 给小范围用户访问。

## 当前线上地址

- 网站首页：`https://daily.ta1zai.com/`
- 日报页：`https://daily.ta1zai.com/daily.html`
- 主域名：`ta1zai.com` 不绑定这个 Worker

## 你需要准备

- GitHub 仓库：`https://github.com/ta1zaI/hotspot-pulse`
- Cloudflare 账号
- 域名：`ta1zai.com`
- 子域名：`daily.ta1zai.com`
- 一个后台管理员密码

## 第 1 步：安装依赖

```bash
npm install
```

## 第 2 步：登录 Cloudflare

```bash
npx wrangler login
```

如果浏览器登录失败，可以改用 Cloudflare API Token，并在命令行里设置 `CLOUDFLARE_API_TOKEN`。

## 第 3 步：创建免费 D1 数据库

```bash
npx wrangler d1 create hotspot-pulse
```

命令会返回一个 `database_id`。把它复制到 `wrangler.toml` 的这里：

```toml
database_id = "你的 D1 database_id"
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

## 第 6 步：确认公开日报链接

`wrangler.toml` 中应配置：

```toml
PUBLIC_DAILY_URL = "https://daily.ta1zai.com/daily.html"
```

## 第 7 步：绑定子域名

`wrangler.toml` 中应配置：

```toml
[[routes]]
pattern = "daily.ta1zai.com"
custom_domain = true
```

不要把主域名 `ta1zai.com` 绑定到这个 Worker。

## 第 8 步：部署

```bash
npx wrangler deploy
```

部署成功后，Cloudflare 会显示：

```text
daily.ta1zai.com (custom domain)
```

## 第 9 步：验收

逐项检查：

- `https://daily.ta1zai.com/` 可以打开。
- `https://daily.ta1zai.com/daily.html` 可以打开。
- `https://daily.ta1zai.com/health` 返回 `{"ok":true}`。
- 管理员可以登录。
- 可以刷新热点。
- 可以保存日报。
- 刷新页面后日报不丢失。

## 免费额度注意事项

这个方案适合二三十个人的小范围使用。免费版当前先启用轻量数据源，避免一次采集太多外部平台导致 Worker 超时。
