---
{"dg-publish":true,"permalink":"/tech/backup-policies/","updated":"2026-06-15T10:45:16.857+05:00","dg-note-properties":{"Created":"2024-05-16 14:27"}}
---

## Once:
- You have three devices that have daily access data: Phone, Tablet and Laptop
- Set up 2 Backup Points -- one main and one cold; we chose Laptop and Cloud
- Set up synching mechanism between the two backup points, manual or automatic 
- Setup Sync from your laptop folders to your cloud in a Backup folder.
- Setup your phone and tablet main work folders with your Laptop as a Sync service in a Sync Folder

## To Backup Quarterly 
### Apps
- Zoho Vault
- Zoho Mail 
- Loom
- GitHub Important Repos
- Canva Files (https://www.canva.com/settings/login-and-security)
### Data
#### Phone & Tablet
- Cut All to-backup Data from your Phone and Tablet Sync folders to your Main Laptop Folders
#### Laptop
- Push all in Dev Folders, WSL gits
## Sync Daily
- Tablet and Phone Sync Manually on Online Time by turning on Wifi and opening Syncthing
## When Switching
#### When Switching Phones:
- Backup WhatsApp
- Sync Syncthing
- Copy Snaptube Folder

#### When Switching Laptops:
[[Tech/Backup Policies#Laptop\|Backup Policies#Laptop]]