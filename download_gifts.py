import os
import zipfile
import json
import urllib.request

url = "https://gist.githubusercontent.com/alberand/ce890338db1a97af07802d5d59c72309/raw/tiktok-gifts-list.json"
print("Fetching TikTok gifts data from Gist...")

try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode('utf-8'))
except Exception as e:
    print(f"Error fetching Gist: {e}")
    exit(1)

# Inspect what structure we received
print(f"Loaded JSON type: {type(data)}")

# Normalize gift items list
gift_items = []
if isinstance(data, list):
    gift_items = data
elif isinstance(data, dict):
    # Check common container keys
    for key in ['gifts', 'data', 'list', 'result']:
        if key in data and isinstance(data[key], list):
            gift_items = data[key]
            break
    if not gift_items:
        # If it's a dict of gifts, try values
        gift_items = list(data.values())

print(f"Found {len(gift_items)} items to process.")

os.makedirs("temp_gifts", exist_ok=True)
zip_filename = "tiktok_gift_images.zip"

success_count = 0
with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for idx, gift in enumerate(gift_items):
        if not isinstance(gift, dict):
            continue
            
        name = gift.get("name") or gift.get("title") or f"gift_{idx}"
        
        # Try finding image URL across various common structures
        image_url = None
        
        # 1. Direct string fields
        for k in ['icon', 'image', 'url', 'imageUrl', 'image_url']:
            val = gift.get(k)
            if isinstance(val, str) and val.startswith('http'):
                image_url = val
                break
            elif isinstance(val, dict):
                # Nested dict like {"url": "..."} or {"url_list": [...]}
                if isinstance(val.get('url'), str):
                    image_url = val.get('url')
                    break
                elif isinstance(val.get('url_list'), list) and val.get('url_list'):
                    image_url = val.get('url_list')[0]
                    break
        
        # 2. Check if there's an image object or list of URL lists
        if not image_url:
            for k, v in gift.items():
                if isinstance(v, dict):
                    if isinstance(v.get('url'), str):
                        image_url = v.get('url')
                        break
                    elif isinstance(v.get('url_list'), list) and v.get('url_list'):
                        image_url = v.get('url_list')[0]
                        break

        if image_url:
            try:
                img_req = urllib.request.Request(image_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(img_req, timeout=5) as img_res:
                    img_data = img_res.read()
                    safe_name = "".join(c for c in str(name) if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_')
                    filename = f"{safe_name}.png"
                    filepath = os.path.join("temp_gifts", filename)
                    
                    with open(filepath, "wb") as f:
                        f.write(img_data)
                    
                    zipf.write(filepath, filename)
                    success_count += 1
                    print(f"[{success_count}] Downloaded: {filename}")
            except Exception as img_err:
                print(f"Skipped {name} ({image_url}): {img_err}")
        else:
            if idx < 5:  # Print debug for first few unparsed items
                print(f"Debug - Could not find image URL in item: {gift}")

# Clean up temp folder
if os.path.exists("temp_gifts"):
    for f in os.listdir("temp_gifts"):
        os.remove(os.path.join("temp_gifts", f))
    os.rmdir("temp_gifts")

print(f"\nDone! Successfully bundled {success_count} images into {zip_filename}.")