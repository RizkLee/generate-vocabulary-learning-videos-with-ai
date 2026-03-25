# Pixabay API — Agent Skills

> A Pixabay API reference handbook for AI Agent programming.
> Official documentation: https://pixabay.com/api/docs/

---

## Overview

Pixabay provides a free search API for two resource types, both returning JSON:

| Resource | Endpoint |
|----------|----------|
| Images | `GET https://pixabay.com/api/` |
| Videos | `GET https://pixabay.com/api/videos/` |

**Authentication**: All requests must include the `key` parameter (API Key) as a query string — no request headers required.

**Rate Limiting**: The following headers are included in every response:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum number of requests allowed per 60 seconds |
| `X-RateLimit-Remaining` | Requests remaining in the current rate limit window |
| `X-RateLimit-Reset` | Seconds until the current rate limit window resets |

---

## Skill 1: Search Images

### Endpoint

```
GET https://pixabay.com/api/
```

### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `key` | string | ✅ | — | Your API Key |
| `q` | string | | — | URL-encoded search term. Max 100 characters. Example: `yellow+flower` |
| `lang` | string | | `"en"` | Language code for the search. Accepted values: `cs da de en es fr id it hu nl no pl pt ro sk fi sv tr vi th bg ru el ja ko zh` |
| `id` | string | | — | Retrieve a single image by its ID |
| `image_type` | string | | `"all"` | Filter by image type. Accepted values: `all` / `photo` / `illustration` / `vector` |
| `orientation` | string | | `"all"` | Filter by orientation. Accepted values: `all` / `horizontal` / `vertical` |
| `category` | string | | — | Filter by category. Accepted values: `backgrounds` `fashion` `nature` `science` `education` `feelings` `health` `people` `religion` `places` `animals` `industry` `computer` `food` `sports` `transportation` `travel` `buildings` `business` `music` |
| `min_width` | int | | `0` | Minimum image width in pixels |
| `min_height` | int | | `0` | Minimum image height in pixels |
| `colors` | string | | — | Filter by color. Comma-separated for multiple values. Accepted values: `grayscale` `transparent` `red` `orange` `yellow` `green` `turquoise` `blue` `lilac` `pink` `white` `gray` `black` `brown` |
| `editors_choice` | bool | | `false` | Return only Editor's Choice images |
| `safesearch` | bool | | `false` | Return only content suitable for all ages |
| `order` | string | | `"popular"` | Sort order. Accepted values: `popular` / `latest` |
| `page` | int | | `1` | Page number for paginated results |
| `per_page` | int | | `20` | Results per page. Range: 3–200 |
| `callback` | string | | — | JSONP callback function name |
| `pretty` | bool | | `false` | Pretty-print JSON output (for debugging only) |

### Response Fields

**Standard fields (all accounts):**

| Field | Description |
|-------|-------------|
| `total` | Total number of hits |
| `totalHits` | Number of images accessible via the API (default max: 500) |
| `hits[].id` | Unique image identifier |
| `hits[].pageURL` | Pixabay source page with original image download link |
| `hits[].type` | Image type: `photo` / `illustration` / `vector` |
| `hits[].tags` | Comma-separated tag string |
| `hits[].previewURL` | Low-res preview image URL (max 150px on longest side) |
| `hits[].previewWidth` / `previewHeight` | Preview image dimensions |
| `hits[].webformatURL` | Medium-res image URL (max 640px on longest side, **valid for 24 hours**) |
| `hits[].webformatWidth` / `webformatHeight` | Medium image dimensions |
| `hits[].largeImageURL` | Large image URL (max 1280px on longest side) |
| `hits[].imageWidth` / `imageHeight` / `imageSize` | Original image dimensions and file size (bytes) |
| `hits[].views` | Total view count |
| `hits[].downloads` | Total download count |
| `hits[].likes` | Total like count |
| `hits[].comments` | Total comment count |
| `hits[].user_id` / `hits[].user` | Contributor ID and username |
| `hits[].userImageURL` | Contributor profile picture URL (250×250px) |

**Extended fields (requires full API access approval):**

| Field | Description |
|-------|-------------|
| `hits[].fullHDURL` | Full HD image URL (max 1920px on longest side) |
| `hits[].imageURL` | Original resolution image URL |
| `hits[].vectorURL` | Vector resource URL (only present for vector type images) |

> **`webformatURL` size substitution tip:**
> Replace `_640` in any `webformatURL` with:
> - `_180` → 180px tall version
> - `_340` → 340px tall version
> - `_960` → max 960×720px version

### Code Example

```python
import requests

def search_images(query: str, api_key: str, **kwargs) -> dict:
    """
    Search Pixabay images.

    Args:
        query:   Search keyword(s)
        api_key: Pixabay API Key
        **kwargs: Optional parameters such as image_type, category, per_page, etc.

    Returns:
        Dict containing total, totalHits, and a hits list.
    """
    params = {
        "key": api_key,
        "q": query,
        "lang": kwargs.get("lang", "en"),
        "image_type": kwargs.get("image_type", "all"),
        "orientation": kwargs.get("orientation", "all"),
        "safesearch": kwargs.get("safesearch", "true"),
        "order": kwargs.get("order", "popular"),
        "per_page": kwargs.get("per_page", 20),
        "page": kwargs.get("page", 1),
    }
    for opt in ["category", "colors", "min_width", "min_height", "id", "editors_choice"]:
        if opt in kwargs:
            params[opt] = kwargs[opt]

    response = requests.get("https://pixabay.com/api/", params=params)
    response.raise_for_status()
    return response.json()


# Usage example
result = search_images(
    query="mountain landscape",
    api_key="YOUR_API_KEY",
    image_type="photo",
    orientation="horizontal",
    category="nature",
    per_page=10,
    safesearch="true"
)

for hit in result["hits"]:
    print(f"ID: {hit['id']}, Tags: {hit['tags']}")
    print(f"  Preview:    {hit['previewURL']}")
    print(f"  Large:      {hit['largeImageURL']}")
```

---

## Skill 2: Search Videos

### Endpoint

```
GET https://pixabay.com/api/videos/
```

### Request Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `key` | string | ✅ | — | Your API Key |
| `q` | string | | — | URL-encoded search term. Max 100 characters |
| `lang` | string | | `"en"` | Language code — same accepted values as the image API |
| `id` | string | | — | Retrieve a single video by its ID |
| `video_type` | string | | `"all"` | Filter by video type. Accepted values: `all` / `film` / `animation` |
| `category` | string | | — | Filter by category — same accepted values as the image API |
| `min_width` | int | | `0` | Minimum video width in pixels |
| `min_height` | int | | `0` | Minimum video height in pixels |
| `editors_choice` | bool | | `false` | Return only Editor's Choice videos |
| `safesearch` | bool | | `false` | Return only content suitable for all ages |
| `order` | string | | `"popular"` | Sort order: `popular` / `latest` |
| `page` | int | | `1` | Page number for paginated results |
| `per_page` | int | | `20` | Results per page. Range: 3–200 |
| `callback` | string | | — | JSONP callback function name |
| `pretty` | bool | | `false` | Pretty-print JSON output (for debugging only) |

### Response Fields

| Field | Description |
|-------|-------------|
| `total` | Total number of hits |
| `totalHits` | Number of videos accessible via the API (default max: 500) |
| `hits[].id` | Unique video identifier |
| `hits[].pageURL` | Pixabay source page URL |
| `hits[].type` | Video type: `film` / `animation` |
| `hits[].tags` | Comma-separated tag string |
| `hits[].duration` | Video duration in seconds |
| `hits[].user_id` / `hits[].user` | Contributor ID and username |
| `hits[].userImageURL` | Contributor profile picture URL |
| `hits[].views` / `downloads` / `likes` / `comments` | Engagement statistics |

**`hits[].videos` object — 4 quality tiers:**

| Tier | Typical Resolution | Availability |
|------|--------------------|--------------|
| `large` | 3840×2160 (4K) | Not always available; empty URL if missing |
| `medium` | 1920×1080 (Full HD) | **Always available** |
| `small` | 1280×720 (HD) | **Always available** |
| `tiny` | 960×540 | **Always available** |

Each tier contains: `url` / `width` / `height` / `size` (bytes) / `thumbnail` (poster image URL)

> **Downloading a video**: Append `?download=1` to the `url` value to trigger a browser download.

### Code Example

```python
import requests

def search_videos(query: str, api_key: str, **kwargs) -> dict:
    """
    Search Pixabay videos.

    Args:
        query:   Search keyword(s)
        api_key: Pixabay API Key
        **kwargs: Optional parameters such as video_type, category, per_page, etc.

    Returns:
        Dict containing total, totalHits, and a hits list.
    """
    params = {
        "key": api_key,
        "q": query,
        "lang": kwargs.get("lang", "en"),
        "video_type": kwargs.get("video_type", "all"),
        "safesearch": kwargs.get("safesearch", "true"),
        "order": kwargs.get("order", "popular"),
        "per_page": kwargs.get("per_page", 20),
        "page": kwargs.get("page", 1),
    }
    for opt in ["category", "min_width", "min_height", "id", "editors_choice"]:
        if opt in kwargs:
            params[opt] = kwargs[opt]

    response = requests.get("https://pixabay.com/api/videos/", params=params)
    response.raise_for_status()
    return response.json()


# Usage example
result = search_videos(
    query="ocean waves",
    api_key="YOUR_API_KEY",
    video_type="film",
    per_page=5
)

for hit in result["hits"]:
    medium = hit["videos"]["medium"]
    print(f"ID: {hit['id']}, Duration: {hit['duration']}s")
    print(f"  Thumbnail: {medium['thumbnail']}")
    print(f"  Video URL: {medium['url']}")
    print(f"  Resolution: {medium['width']}x{medium['height']}, Size: {medium['size']} bytes")
```

---

## Skill 3: Unified Client Wrapper (Recommended for Agents)

A reusable `PixabayClient` class for clean integration in AI Agent workflows:

```python
import requests
from typing import Literal, Optional


class PixabayClient:
    BASE_IMAGE_URL = "https://pixabay.com/api/"
    BASE_VIDEO_URL = "https://pixabay.com/api/videos/"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.session = requests.Session()

    def search_images(
        self,
        query: str,
        image_type: Literal["all", "photo", "illustration", "vector"] = "all",
        orientation: Literal["all", "horizontal", "vertical"] = "all",
        category: Optional[str] = None,
        colors: Optional[str] = None,
        min_width: int = 0,
        min_height: int = 0,
        editors_choice: bool = False,
        safesearch: bool = True,
        order: Literal["popular", "latest"] = "popular",
        page: int = 1,
        per_page: int = 20,
        lang: str = "en",
    ) -> dict:
        params = {
            "key": self.api_key, "q": query, "lang": lang,
            "image_type": image_type, "orientation": orientation,
            "editors_choice": str(editors_choice).lower(),
            "safesearch": str(safesearch).lower(),
            "order": order, "page": page, "per_page": per_page,
        }
        if category:   params["category"] = category
        if colors:     params["colors"] = colors
        if min_width:  params["min_width"] = min_width
        if min_height: params["min_height"] = min_height

        r = self.session.get(self.BASE_IMAGE_URL, params=params)
        r.raise_for_status()
        return r.json()

    def search_videos(
        self,
        query: str,
        video_type: Literal["all", "film", "animation"] = "all",
        category: Optional[str] = None,
        editors_choice: bool = False,
        safesearch: bool = True,
        order: Literal["popular", "latest"] = "popular",
        page: int = 1,
        per_page: int = 20,
        lang: str = "en",
    ) -> dict:
        params = {
            "key": self.api_key, "q": query, "lang": lang,
            "video_type": video_type,
            "editors_choice": str(editors_choice).lower(),
            "safesearch": str(safesearch).lower(),
            "order": order, "page": page, "per_page": per_page,
        }
        if category: params["category"] = category

        r = self.session.get(self.BASE_VIDEO_URL, params=params)
        r.raise_for_status()
        return r.json()

    def get_image_by_id(self, image_id: str) -> dict:
        """Retrieve a single image by its Pixabay ID."""
        r = self.session.get(self.BASE_IMAGE_URL, params={"key": self.api_key, "id": image_id})
        r.raise_for_status()
        hits = r.json().get("hits", [])
        return hits[0] if hits else {}

    def get_video_by_id(self, video_id: str) -> dict:
        """Retrieve a single video by its Pixabay ID."""
        r = self.session.get(self.BASE_VIDEO_URL, params={"key": self.api_key, "id": video_id})
        r.raise_for_status()
        hits = r.json().get("hits", [])
        return hits[0] if hits else {}

    @staticmethod
    def get_webformat_url(webformat_url: str, size: Literal[180, 340, 640, 960] = 640) -> str:
        """Substitute the size suffix in a webformatURL."""
        return webformat_url.replace("_640", f"_{size}")

    @staticmethod
    def get_best_video_url(
        hit: dict,
        prefer: Literal["large", "medium", "small", "tiny"] = "medium"
    ) -> str:
        """
        Return the best available video URL from a hit object,
        falling back to lower quality tiers if the preferred one is unavailable.
        """
        priority = ["large", "medium", "small", "tiny"]
        start = priority.index(prefer)
        ordered = priority[start:] + priority[:start]
        for quality in ordered:
            url = hit.get("videos", {}).get(quality, {}).get("url", "")
            if url:
                return url
        return ""
```

---

## Important Notes for Agent Development

1. **`webformatURL` expiry**: This URL is only valid for **24 hours**. Do not cache it. Cache the image `id` instead and re-fetch the URL on demand.

2. **API result cap**: Each query returns a maximum of 500 records. Use `page` and `per_page` to paginate through results.

3. **Search term encoding**: The `q` parameter must be URL-encoded. The `requests` library handles this automatically when you pass a plain string.

4. **Full API access**: The fields `fullHDURL`, `imageURL`, and `vectorURL` are only available after your Pixabay account has been approved for full API access.

5. **Licensing**: Pixabay content is released under the Pixabay License — free for commercial use with no attribution required. Always review the official license terms before use.

6. **Rate limit monitoring**: Check `X-RateLimit-Remaining` in the response headers after each call to avoid hitting the rate limit in high-frequency agent workflows.