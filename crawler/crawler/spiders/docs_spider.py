import os

import scrapy

from ..items import CrawlResult
from .spider_base import SpiderBase

class DocSpider(scrapy.Spider, SpiderBase):
    name             = "docs"

    http_user        = os.environ.get("DOC_USER", None)
    http_pass        = os.environ.get("DOC_PASS", None)
    http_host        = os.environ.get("DOC_HOST", None)
    http_auth_domain = (http_host or "http://localhost").split("://")[1]

    start_points     = [http_host]
    include_url      = start_points[:]

    def start_requests(self):
        for url in self.start_points:
            yield scrapy.Request(url=url, callback=self.parse)

    def parse(self, response):
        # Check this a HTML page
        content_type = response.headers.get("Content-Type", None).decode("utf-8")
        self.logger.info(f"Parsing {response.url} of type '{content_type}'")
        if "text/html" in content_type:
            # Extract title & content and create a result
            node_title   = response.xpath("//title/text()")
            node_content = response.xpath("//div[@class = 'wy-nav-content']")
            if node_title and node_content:
                text = node_content[0].root.text_content()
                text = " ".join((x.strip() for x in text.split("\n") if len(x.strip()) > 0))
                yield CrawlResult(
                    uid     = self.create_uid(response),
                    url     = response.url,
                    title   = node_title.get(),
                    content = text,
                    source  = self.name
                )
            # Chase every linked page
            yield from self.chase_all(response)
