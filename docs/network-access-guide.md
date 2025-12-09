# Network Access Guide - Accessing localhost:3434 from Another Computer

Your server is already configured to listen on `0.0.0.0`, which means it can accept connections from other computers on your network. Follow these steps:

## Step 1: Find Your Computer's Local IP Address

On the computer running the server, open PowerShell and run:

```powershell
ipconfig
```

Look for the **IPv4 Address** under your active network adapter (usually "Ethernet adapter" or "Wireless LAN adapter"). It will look something like:
- `192.168.1.100`
- `10.0.0.50`
- `172.16.0.25`

**Note:** This is your computer's IP address on your local network, not `127.0.0.1` or `localhost`.

## Step 2: Configure Windows Firewall

Windows Firewall may block incoming connections. You need to allow port 3434:

### Option A: Using PowerShell (Run as Administrator)

```powershell
New-NetFirewallRule -DisplayName "Game Server Port 3434" -Direction Inbound -LocalPort 3434 -Protocol TCP -Action Allow
```

### Option B: Using Windows Firewall GUI

1. Open **Windows Defender Firewall** (search in Start menu)
2. Click **Advanced settings**
3. Click **Inbound Rules** → **New Rule**
4. Select **Port** → **Next**
5. Select **TCP** and enter port **3434** → **Next**
6. Select **Allow the connection** → **Next**
7. Check all profiles (Domain, Private, Public) → **Next**
8. Name it "Game Server Port 3434" → **Finish**

## Step 3: Connect from Another Computer

On the other computer on your network, open a web browser and navigate to:

```
http://[YOUR_IP_ADDRESS]:3434
```

For example:
- `http://192.168.1.100:3434`
- `http://192.168.1.100:3434/game`

## Step 4: Verify Server is Running

Make sure your server is running on the host computer. You should see:

```
Server running on http://0.0.0.0:3434
```

## Troubleshooting

### Can't connect from other computer?

1. **Check firewall:** Make sure Windows Firewall rule was created successfully
2. **Check IP address:** Make sure you're using the correct local IP (not 127.0.0.1)
3. **Check network:** Both computers must be on the same network (same router)
4. **Check server status:** Verify the server is actually running and listening
5. **Try ping:** From the other computer, try `ping [YOUR_IP_ADDRESS]` to verify network connectivity

### Firewall command didn't work?

If you get an error about the rule already existing, you can check existing rules:

```powershell
Get-NetFirewallRule -DisplayName "*3434*"
```

Or remove and recreate:

```powershell
Remove-NetFirewallRule -DisplayName "Game Server Port 3434"
New-NetFirewallRule -DisplayName "Game Server Port 3434" -Direction Inbound -LocalPort 3434 -Protocol TCP -Action Allow
```

### Still having issues?

- Make sure both computers are on the same network segment
- Some routers have "AP Isolation" or "Client Isolation" enabled - this prevents devices from talking to each other
- Check if your antivirus has a firewall that might be blocking connections

## Security Note

Opening port 3434 to your local network is generally safe, but be aware:
- Only devices on your local network can access it
- If you're on a public WiFi network, other users could potentially access your server
- For production deployments, consider using proper authentication and HTTPS


