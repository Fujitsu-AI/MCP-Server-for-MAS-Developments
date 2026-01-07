import feedparser
import requests


def fetch_feed(rss_url):
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; RSSFetcher/1.0; +https://example.com)"
    }

    # Use requests to fetch the raw feed first
    try:
        response = requests.get(rss_url, headers=headers, timeout=10)
        response.raise_for_status()
        content = response.text
    except requests.RequestException as e:
        print(f"Failed to fetch RSS feed: {e}")
        exit(1)

    # Now parse the content using feedparser
    feed = feedparser.parse(content)

    if 'title' in feed.feed:
        print(f"Feed Title: {feed.feed.title}\n")
    else:
        print("Failed to parse feed metadata.")

    # Show entries
    text = ""
    for entry in feed.entries:
        text += f"Title: {entry.title}"
        text += f"Link: {entry.link}"
        text += f"Published: {entry.get('published', 'N/A')}"
        text += f"Summary: {entry.get('summary', 'No summary')}\n"
        text += "-" * 80

    return text
