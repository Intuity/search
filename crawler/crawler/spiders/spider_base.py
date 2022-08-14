import re
from hashlib import md5

class SpiderBase:
    include_url  = []
    exclude_url  = [re.compile(r".*\.png"), re.compile(r".*\.pdf")]
    rgx_uid      = re.compile(r"[\W]+")

    def check_url(self, url):
        # Check if the URL matches an include pattern
        for expr in self.include_url:
            if isinstance(expr, re.Pattern) and expr.match(url):
                break
            elif isinstance(expr, str) and url.startswith(expr):
                break
        else:
            return False
        # Check if the URL matches an exclude pattern
        for expr in self.exclude_url:
            if isinstance(expr, re.Pattern) and expr.match(url):
                break
            elif isinstance(expr, str) and url.startswith(expr):
                break
        else:
            return True
        # Otherwise, did not match
        return False

    def create_uid(self, response):
        return md5(self.rgx_uid.sub("_", response.url).lower().encode("utf-8")).hexdigest()

    def chase_all(self, response):
        for link in response.xpath("//a/@href").getall():
            full_link = response.urljoin(link)
            if self.check_url(full_link):
                yield response.follow(response.urljoin(link), callback=self.parse)
