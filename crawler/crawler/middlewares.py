# Define here the models for your spider middleware
#
# See documentation in:
# https://docs.scrapy.org/en/latest/topics/spider-middleware.html

import os
import urllib3

from lxml import etree
import requests
from scrapy import signals

class PhabricatorMiddleware:
    # Not all methods need to be defined. If a method is not defined,
    # scrapy acts as if the spider middleware does not modify the
    # passed objects.

    @classmethod
    def from_crawler(cls, crawler):
        # This method is used by Scrapy to create your spiders.
        s = cls()
        crawler.signals.connect(s.spider_opened, signal=signals.spider_opened)
        return s

    def spider_opened(self, spider):
        spider.logger.info("Getting phabricator access token")
        self.phab_user = os.environ.get("PHAB_USER", None)
        self.phab_pass = os.environ.get("PHAB_PASS", None)
        self.phab_host = os.environ.get("PHAB_HOST", "https://localhost")
        # Create a shared session
        self.session = requests.Session()
        # Go to the login page
        try:
            login = etree.fromstring(self.session.get(self.phab_host).text)
        except requests.exceptions.ConnectionError:
            spider.logger.error(f"Failed to connect to Phabricator: {self.phab_host}")
            return
        csrf   = login.xpath("//form/input[@name = '__csrf__']/@value")
        form   = login.xpath("//form/input[@name = '__form__']/@value")
        dialog = login.xpath("//form/input[@name = '__dialog__']/@value")
        if not csrf or not form or not dialog:
            spider.logger.error(f"Failed to extract form elements: {self.phab_host}")
            return
        spider.logger.info(f"Phabricator CSRF: {csrf}")
        # Use form to trigger a login
        req = self.session.post(self.phab_host + "/auth/login/password:self/",
                                headers={ "User-Agent": "Mozilla/5.0" },
                                data   ={ "__csrf__"  : csrf,
                                          "__form__"  : form,
                                          "__dialog__": dialog,
                                          "username"  : self.phab_user,
                                          "password"  : self.phab_pass })
        assert req.status_code == 200, "Failed to authenticate with Phabricator"
        spider.logger.info(f"Logged into Phabricator: {self.session.cookies.items()}")

    def process_request(self, request, spider):
        # Inject session variables into the phabricator requests
        if request.url.startswith(self.phab_host):
            request.cookies = dict(self.session.cookies)
