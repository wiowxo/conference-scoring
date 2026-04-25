# Деплой на VPS

## Первый деплой

Подключитесь к VPS по SSH и выполните одну команду:

```bash
apt install git -y && git clone https://github.com/wiowxo/conference-scoring.git && cd conference-scoring && bash setup.sh
```

Скрипт спросит:
- Доменное имя (rgsu-conf.ru)
- Email для SSL сертификата
- Пароль базы данных (или сгенерирует автоматически)

После завершения приложение доступно по https://rgsu-conf.ru

Войдите с логином `admin` и паролем `admin` — система попросит сменить пароль.

## Обновление

```bash
cd conference-scoring
git pull
docker compose --env-file .env.production up -d --build
```

## Полезные команды

```bash
docker compose logs -f app      # логи приложения
docker compose ps               # статус контейнеров
docker compose restart app      # перезапустить приложение
docker compose down             # остановить всё
```

## Сброс пароля организатора

```bash
docker compose exec app node scripts/reset-password.js
```

## Полная очистка базы данных

```bash
docker compose exec app sh scripts/reset-password.sh --wipe
```
