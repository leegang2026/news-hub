# News Hub 阿里云轻量服务器部署指南

> 服务器：阿里云轻量应用服务器（1.8GB RAM）
> 系统：Alibaba Cloud Linux 3（兼容 CentOS/RHEL）
> 公网 IP：`47.107.145.156:3000`

## 一、环境准备

### 1. 服务器初始化

```bash
# 安装 Node.js 20
sudo dnf module reset nodejs
sudo dnf module enable nodejs:20
sudo dnf install -y nodejs git

# 安装 pm2（进程守护）
npm install -g pm2

# 创建部署目录
sudo mkdir -p /opt/news-hub
sudo chown $(whoami) /opt/news-hub
```

### 2. 设置 swap（防止内存不足）

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 二、构建与上传

**关键策略：本地构建，上传产物**

服务器仅 1.8GB RAM，无法直接运行 `npm run build`（需要 2-4GB），因此采用「本地 Windows 构建 + 上传 `.next` 产物」的方式。

### 1. 本地构建（Windows）

```bash
# 在项目根目录执行
npm install
npm run build

# 打包产物
tar -czvf next-build.tar.gz .next public package.json package-lock.json .env.local next.config.ts next-env.d.ts tsconfig.json
```

### 2. 上传到服务器

```bash
# 使用 scp（在 Windows PowerShell 或 Git Bash 中）
scp next-build.tar.gz root@47.107.145.156:/opt/news-hub/

# SSH 登录服务器解压
ssh root@47.107.145.156
cd /opt/news-hub
tar -xzvf next-build.tar.gz
npm install --production
```

### 3. 环境变量

确保服务器上有 `.env.local`：

```env
NEXT_PUBLIC_SUPABASE_URL=https://wwwqueddxfilhhpjuybb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3d3F1ZWRkeGZpbGhocGp1eWJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MjYzMTQsImV4cCI6MjA5NTAwMjMxNH0.EapKWCYLwsSeue5aWT5v7Ycn_ay5PLpeBJdSLD3HuqI
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3d3F1ZWRkeGZpbGhocGp1eWJiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQyNjMxNCwiZXhwIjoyMDk1MDAyMzE0fQ.PB8aXF2bCZQvh6_bQwOpW2siAFv9CF2x8TLRlt1fAbA
CRON_SECRET=pkhub2026cron_secret_x9
NEXT_PUBLIC_DEMO_MODE=false
```

> 注意：长密钥建议直接写入文件后上传，避免终端粘贴截断。

## 三、启动与守护

### 1. pm2 启动

```bash
cd /opt/news-hub
pm2 start npm --name "news-hub" -- start
pm2 save
pm2 startup systemd
```

### 2. 常用命令

```bash
pm2 status              # 查看状态
pm2 logs news-hub       # 查看日志
pm2 restart news-hub    # 重启
pm2 stop news-hub       # 停止
pm2 delete news-hub     # 删除
```

### 3. 端口冲突处理

若启动报错 `EADDRINUSE: address already in use :::3000`：

```bash
# 查找并杀死占用 3000 端口的进程
fuser -k 3000/tcp
# 然后重启 pm2
pm2 restart news-hub
```

## 四、安全组与防火墙

阿里云控制台 → 轻量服务器 → 安全/防火墙 → 添加规则：

| 端口 | 协议 | 说明 |
|------|------|------|
| 22   | TCP  | SSH（默认已有） |
| 3000 | TCP  | Next.js 应用 |
| 80   | TCP  | Nginx（可选） |
| 443  | TCP  | HTTPS（可选） |

## 五、Supabase 配置

登录 Supabase Dashboard → Authentication → URL Configuration：

- **Site URL**：`http://47.107.145.156:3000`
- **Redirect URLs**：添加 `http://47.107.145.156:3000/*`

否则注册/登录的确认邮件和回调链接会指向错误的地址。

## 六、定时任务（crontab）

服务器上 `vercel.json` 不会自动生效，需手动配置 crontab：

```bash
crontab -e
```

添加：

```cron
# News Hub 定时任务
0 7 * * * curl -s -H "Authorization: Bearer pkhub2026cron_secret_x9" http://localhost:3000/api/cron/fetch >> /var/log/news-hub-cron.log 2>&1
0 8 * * * curl -s -H "Authorization: Bearer pkhub2026cron_secret_x9" http://localhost:3000/api/cron/daily >> /var/log/news-hub-cron.log 2>&1
```

查看日志：

```bash
tail -f /var/log/news-hub-cron.log
```

## 七、更新部署流程

后续代码更新时，按以下步骤重新部署：

```bash
# === 本地 Windows ===
npm install
npm run build
tar -czvf next-build.tar.gz .next public package.json package-lock.json .env.local next.config.ts next-env.d.ts tsconfig.json
scp next-build.tar.gz root@47.107.145.156:/opt/news-hub/

# === 服务器 ===
cd /opt/news-hub
pm2 stop news-hub
tar -xzvf next-build.tar.gz
npm install --production
pm2 restart news-hub
pm2 status
```

## 八、已知问题与解决

| 问题 | 原因 | 解决 |
|------|------|------|
| 构建被 SIGKILL | 服务器内存不足（<2GB） | 本地构建后上传产物 |
| `EADDRINUSE :::3000` | 旧进程未释放端口 | `fuser -k 3000/tcp` 后重启 |
| 中文字符乱码 | 终端编码问题 | 使用 UTF-8 编码终端 |
| Supabase 邮件链接打不开 | URL Configuration 未配置 | 设置 Site URL 和 Redirect URLs |
| 长密钥粘贴截断 | 终端缓冲区限制 | 文件上传方式传递 `.env.local` |

## 技术栈

- 前端：Next.js 16 + Tailwind CSS + shadcn/ui
- 后端：Next.js API Routes + pm2 守护
- 数据库：Supabase PostgreSQL（云端）
- 认证：Supabase Auth
- AI：多模型支持（Gemini、OpenAI、Claude 等）
- 部署：阿里云轻量服务器 + pm2 + crontab
