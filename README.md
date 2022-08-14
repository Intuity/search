# Crawler & Search Front-End

## Meilisearch Environment Variables

```bash
$> export MS_API_URL="http://meilisearch.example.com:7700"
$> export MS_API_KEY="abcdefg12345678"
$> export MS_API_INDEX="docs"
```

## Crawling Documentation

```bash
$> cd crawler
$> DOC_PASS=testpwd DOC_HOST="http://docs.example.com" scrapy crawl -L INFO docs
```

## Crawling Phabricator Maniphest

```bash
$> cd crawler
$> PHAB_HOST="https://phabricator.example.com" PHAB_USER="user" PHAB_PASS="passwd" scrapy crawl -L INFO phabricator
```

## Resetting Meilisearch Index

NOTE: This will delete all entries from the Meilisearch index and cannot be undone

```bash
$> cd crawler
$> PHAB_HOST=... PHAB_USER=... PHAB_PASS=... scrapy crawl -L INFO phabricator -a ms_clear_index=1
```

## Web Interface

The following parameters need to be changed in `seach/search.js`:

```javascript
class Search {

    // Meilisearch credentials
    MS_HOST     = "http://meilisearch.example.com:7700";
    MS_API_KEY  = "abcdefg12345678";

    // ...

};
```

## Credits

Favicon - Search by INDRAWATI from [Noun Project](https://thenounproject.com/browse/icons/term/search)</a>
Background - Memphis Colorful by [Raul Gaitan](https://raulgaitan.com)
