# Railway Variable Cleanup Guide

## Current Issue

Deployment is failing with: `ERROR: failed to build: failed to solve: secret NODE_ENV: not found`

This is caused by **duplicate environment variables** that need to be cleaned up in the Railway dashboard.

## Problem

The Railway CLI shows multiple duplicate variables:
- `BASE_URL` appears **3 times**
- `DATABASE_URL` appears **2 times**  
- `SESSION_SECRET` appears **2 times**
- `NODE_ENV` appears **2 times**

Railway's build system is getting confused by these duplicates and trying to reference them as secrets.

## Solution: Clean Up via Railway Dashboard

Since Railway CLI doesn't support deleting variables directly, you need to use the web dashboard:

### Steps:

1. **Open Railway Dashboard**:
   ```bash
   railway open
   ```
   Or visit: https://railway.com/project/d2f41f4a-4ddb-4c2f-a3ee-b3f716990c2e

2. **Navigate to Service**:
   - Click on "final production" service
   - Go to "Variables" tab

3. **Delete Duplicate Variables**:
   
   For each duplicate, delete the incorrect ones and keep only:
   
   - **BASE_URL**: Keep only `https://final-production-production.up.railway.app`
     - Delete the other 2 entries
   
   - **DATABASE_URL**: Keep the direct connection string:
     - `postgresql://postgres:SxzgjjzfQJLvvKiAGtXgnSqPXbyHEwSG@postgres.railway.internal:5432/railway`
     - Delete the duplicate
     - **OR** better: Use "Reference Variable" to link to PostgreSQL service
   
   - **SESSION_SECRET**: Keep only the hex value:
     - `bde93c5c94d38119c483287bb33fc25d8c99a246b62d940ddcb62b33d02b9b61`
     - Delete the entry with the instruction text
   
   - **NODE_ENV**: Keep only `production`
     - Delete the duplicate

4. **Verify Final Variables** (should have only one of each):
   ```
   BASE_URL = https://final-production-production.up.railway.app
   DATABASE_URL = postgresql://postgres:...@postgres.railway.internal:5432/railway
   NODE_ENV = production
   SESSION_SECRET = bde93c5c94d38119c483287bb33fc25d8c99a246b62d940ddcb62b33d02b9b61
   SMTP_HOST = smtpout.secureserver.net
   SMTP_PORT = 587
   SMTP_SECURE = false
   SMTP_USER = brian@brianfloyd.me
   SMTP_USERNAME = brian
   SMTP_PASSWORD = Hh37683768!
   ```

5. **Redeploy**:
   ```bash
   railway up
   ```

## Alternative: Use Railway Dashboard to Set Variables

Instead of using CLI, you can set all variables fresh in the dashboard:

1. Delete ALL variables for "final production" service
2. Add them back one by one with correct values
3. For `DATABASE_URL`, use "Reference Variable" button to link to PostgreSQL

## Quick Reference

- **Project**: final production
- **Service**: final production  
- **URL**: https://final-production-production.up.railway.app
- **Dashboard**: https://railway.com/project/d2f41f4a-4ddb-4c2f-a3ee-b3f716990c2e


