# Google Drive Sync Setup

Sync uses your personal Google Drive to store a sync file. The app only has access to **files it created itself** — your other Drive files are not visible.

---

## Step 1. Create a project in Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. If you don't have a project — one will be created automatically (Default Project). If you want a separate one — click the project name at the top → **New Project** → enter a name → **Create**

## Step 2. Enable Google Drive API

1. In the left menu: **APIs & Services** → **Library**
2. Search for **Google Drive API**
3. Click on it → **Enable**

## Step 3. Configure OAuth consent screen

1. In the left menu: **Google Auth Platform** → **Branding**
2. Fill in:
   - **App name**: Task Orchestrator (or any name)
   - **User support email**: your email
3. Click **Save**
4. Go to **Audience** (left menu)
5. Select **External** → **Save**
6. At the bottom in **Test users**, click **Add users**
7. Enter the email of your Google account (the one you'll sync with)
8. Click **Save**

> **Important:** Add every Google account that will use sync to Test users. Up to 100 users can be added.

## Step 4. Create OAuth Client ID

A single **Web application** client is used for both desktop and PWA.

1. In the left menu: **Clients** → **+ Create Client**
2. **Application type**: **Web application**
3. **Name**: Task Orchestrator
4. **Authorized JavaScript origins** (add all):
   - `http://localhost`
   - If using the hosted PWA: `https://daybov.com`
5. **Authorized redirect URIs** (add all):
   - `http://127.0.0.1:19284` (desktop app)
   - If using the hosted PWA: `https://daybov.com/to/`
   - If self-hosting PWA: your PWA URL (e.g. `https://yourdomain.com/path/`)
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

> **Important:** Redirect URIs must match exactly, including the trailing `/`. Port `19284` is the fixed port used by the desktop app. If you self-host the PWA, add your own URL as a redirect URI.

## Step 5. Connect in the app

The same Client ID / Client Secret is used on all platforms.

### Desktop (Tauri)

1. Open Task Orchestrator
2. **Settings** → **Sync** tab
3. In the **Google Drive** section, enter **Client ID** and **Client Secret** from Step 4
4. Click **Connect Google Drive**
5. A browser window will open — sign in to Google and grant access
6. Return to the app — status will change to "Google Drive connected"

### PWA (web version)

1. Open the PWA (e.g. `https://daybov.com/to/`)
2. **Settings** (gear icon) → **Google Drive**
3. Enter the same **Client ID** and **Client Secret** from Step 4
4. Click **Connect**
5. You'll be redirected to Google — sign in and grant access
6. After returning to the PWA — sync is connected

## Usage

- Click **Sync** for manual synchronization
- The app will download changes from Drive, apply them, and upload your changes back
- Repeat on each device with the same Google account
- **Auto-sync** is enabled by default — changes sync automatically after 2 seconds

## FAQ

**Is this free?**
Yes, completely. Google Drive API is free for personal use.

**Can the app see my files on Google Drive?**
No. It uses the `drive.appdata` scope — access only to files created by the app. Your documents, photos, and other files are invisible.

**"Access blocked" error on sign-in?**
Make sure your email is added to Test users (Step 3, items 6-8).

**Can I use it on multiple devices?**
Yes. One Client ID/Secret for all platforms. Sign in with the same Google account on all devices.

**`redirect_uri_mismatch` error?**
Check that Authorized redirect URIs include both addresses: your PWA URL and `http://127.0.0.1:19284` (for desktop). URIs must match exactly, including the trailing `/`.

**`invalid_client` error?**
Client ID not found. Make sure you copied the ID correctly and that a few minutes have passed since creating the client (Google may take up to 5 minutes to activate).

**How to disconnect sync?**
Settings → Sync → Google Drive → **Disconnect**. Tokens will be deleted. The file on Drive will remain (you can delete it manually via Google Drive).

---

# Настройка синхронизации через Google Drive

Синхронизация использует ваш личный Google Drive для хранения файла синхронизации. Приложение имеет доступ **только к файлам, которые оно само создало** — остальные файлы на вашем Drive недоступны.

---

## Шаг 1. Создайте проект в Google Cloud Console

1. Откройте [Google Cloud Console](https://console.cloud.google.com/)
2. Войдите в свой Google-аккаунт
3. Если у вас нет проекта — он будет создан автоматически (Default Project). Если хотите отдельный — нажмите на название проекта вверху → **New Project** → введите имя → **Create**

## Шаг 2. Включите Google Drive API

1. В левом меню: **APIs & Services** → **Library**
2. В поиске введите **Google Drive API**
3. Нажмите на него → **Enable**

## Шаг 3. Настройте OAuth consent screen

1. В левом меню: **Google Auth Platform** → **Branding**
2. Заполните:
   - **App name**: Task Orchestrator (или любое название)
   - **User support email**: ваш email
3. Нажмите **Save**
4. Перейдите в **Audience** (левое меню)
5. Выберите **External** → **Save**
6. Внизу в разделе **Test users** нажмите **Add users**
7. Введите email вашего Google-аккаунта (тот, с которым будете синхронизировать)
8. Нажмите **Save**

> **Важно:** Добавьте в Test users каждый Google-аккаунт, с которого будете использовать синхронизацию. Можно добавить до 100 пользователей.

## Шаг 4. Создайте OAuth Client ID

Один клиент типа **Web application** используется и для десктопа, и для PWA.

1. В левом меню: **Clients** → **+ Create Client**
2. **Application type**: **Web application**
3. **Name**: Task Orchestrator
4. **Authorized JavaScript origins** (добавьте все):
   - `http://localhost`
   - Если используете размещённую PWA: `https://daybov.com`
5. **Authorized redirect URIs** (добавьте все):
   - `http://127.0.0.1:19284` (десктоп)
   - Если используете размещённую PWA: `https://daybov.com/to/`
   - Если размещаете PWA самостоятельно: ваш URL (например `https://yourdomain.com/path/`)
6. Нажмите **Create**
7. Скопируйте **Client ID** и **Client Secret**

> **Важно:** Redirect URI должен точно совпадать с адресом, включая завершающий `/`. Порт `19284` — фиксированный порт десктопного приложения. Если вы размещаете PWA самостоятельно, добавьте свой URL в redirect URIs.

## Шаг 5. Подключите в приложении

Один и тот же Client ID / Client Secret используется на всех платформах.

### Десктоп (Tauri)

1. Откройте Task Orchestrator
2. **Settings** → вкладка **Sync**
3. В разделе **Google Drive** введите **Client ID** и **Client Secret** из шага 4
4. Нажмите **Подключить Google Drive**
5. Откроется браузер — войдите в Google-аккаунт и разрешите доступ
6. Вернитесь в приложение — статус изменится на «Google Drive подключён»

### PWA (веб-версия)

1. Откройте PWA (например `https://daybov.com/to/`)
2. **Settings** (шестерёнка) → **Google Drive**
3. Введите те же **Client ID** и **Client Secret** из шага 4
4. Нажмите **Подключить**
5. Произойдёт redirect на Google — войдите и разрешите доступ
6. После возврата в PWA — синхронизация подключена

## Использование

- Нажмите **Синхронизировать** для ручной синхронизации
- Приложение скачает изменения с Drive, применит их, и загрузит ваши изменения обратно
- Повторите на каждом устройстве с тем же Google-аккаунтом
- **Автосинхронизация** включена по умолчанию — изменения синхронизируются автоматически через 2 секунды

## FAQ

**Это бесплатно?**
Да, полностью. Google Drive API бесплатен для личного использования.

**Приложение видит мои файлы на Google Drive?**
Нет. Используется scope `drive.appdata` — доступ только к файлам, созданным приложением. Ваши документы, фото и другие файлы невидимы.

**При входе показывается "Access blocked"?**
Убедитесь, что ваш email добавлен в Test users (Шаг 3, пункт 6-8).

**Можно ли использовать на нескольких устройствах?**
Да. Один Client ID/Secret для всех платформ. Войдите в тот же Google-аккаунт на всех устройствах.

**Ошибка `redirect_uri_mismatch`?**
Проверьте, что в Authorized redirect URIs добавлены оба адреса: URL вашей PWA и `http://127.0.0.1:19284` (для десктопа). URI должны совпадать точно, включая `/` в конце.

**Ошибка `invalid_client`?**
Client ID не найден. Убедитесь, что скопировали ID правильно, и что прошло несколько минут после создания клиента (Google может активировать с задержкой до 5 минут).

**Как отключить синхронизацию?**
Settings → Sync → Google Drive → **Отключить**. Токены будут удалены. Файл на Drive останется (можно удалить вручную через Google Drive).
