import os
import re

import scrapy

from ..items import CrawlResult
from .spider_base import SpiderBase

class PhabricatorSpider(scrapy.Spider, SpiderBase):
    name         = "phabricator"

    phab_host    = os.environ.get("PHAB_HOST", "https://localhost")
    start_points = [phab_host + "/maniphest/query/all/"]
    include_url  = start_points[:] + [re.compile(phab_host + r"/T.*")]

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
            node_content = response.xpath("//div[@class = 'phabricator-remarkup']")
            if node_title and node_content:
                text = ""
                for section in node_content:
                    part = section.root.text_content()
                    text += " ".join((x.strip() for x in part.split("\n") if len(x.strip()) > 0))
                yield CrawlResult(
                    uid     = self.create_uid(response),
                    url     = response.url,
                    title   = node_title.get(),
                    content = text,
                    source  = self.name
                )
            # Chase every linked page
            yield from self.chase_all(response)
