# Define your item pipelines here
#
# Don't forget to add your pipeline to the ITEM_PIPELINES setting
# See: https://docs.scrapy.org/en/latest/topics/item-pipeline.html


# useful for handling different item types with a single interface
import json
import os
from hashlib import md5
from pathlib import Path

import meilisearch


class MeiliPipeline:

    MEILI_API_URL    = os.environ.get("MS_API_URL", None)
    MEILI_API_KEY    = os.environ.get("MS_API_KEY", None)
    MEILI_API_INDEX  = os.environ.get("MS_API_INDEX", None)
    MEILI_BATCH_SIZE = int(os.environ.get("MS_BATCH_SIZE", 10))

    UID_LOOKUP_FILE  = "uid.json"
    CONTENT_MD5_FILE = "content.json"

    def open_spider(self, spider):
        # Tracking file paths
        self.uid_path  = Path.cwd() / self.UID_LOOKUP_FILE
        self.hash_path = Path.cwd() / self.CONTENT_MD5_FILE
        # Open a connection to Meilisearch
        self.m_client = meilisearch.Client(self.MEILI_API_URL,
                                           self.MEILI_API_KEY)
        # Delete index if requested
        if getattr(spider, "ms_clear_index", False) is not False:
            spider.logger.warning(f"Deleting Meilisearch index {self.MEILI_API_INDEX}")
            self.m_client.delete_index(self.MEILI_API_INDEX)
            spider.logger.warning("Deleting tracking files")
            self.uid_path.unlink(missing_ok=True)
            self.hash_path.unlink(missing_ok=True)
        # Check index exists (create it if not)
        self.m_index = self.m_client.index(self.MEILI_API_INDEX)
        try:
            self.m_index.get_settings()
        except meilisearch.errors.MeiliSearchApiError:
            spider.logger.info(f"Creating missing '{self.MEILI_API_INDEX}' index")
            self.m_client.create_index(self.MEILI_API_INDEX)
            self.m_index.update_filterable_attributes(["source"])
        # Read in the UID -> ID mapping
        if self.uid_path.exists():
            with open(self.uid_path, "r", encoding="utf-8") as fh:
                self.uids = json.load(fh)
        else:
            self.uids = {}
        self.next_id = max(self.uids.values(), default=0)
        # Read in the content hashes
        if self.hash_path.exists():
            with open(self.hash_path, "r", encoding="utf-8") as fh:
                self.hashes = json.load(fh)
        else:
            self.hashes = {}
        # Accumulate batches
        self.batch = []

    def close_spider(self, spider):
        self.flush(force=True)
        with open(self.uid_path, "w", encoding="utf-8") as fh:
            json.dump(self.uids, fh, indent=4)
        with open(self.hash_path, "w", encoding="utf-8") as fh:
            json.dump(self.hashes, fh, indent=4)

    def uid_to_id(self, uid):
        if uid not in self.uids:
            self.uids[uid] = self.next_id
            self.next_id += 1
        return self.uids[uid]

    def process_item(self, item, spider):
        content_hash = md5((item.title + item.content).encode("utf-8")).hexdigest()
        doc_id       = self.uid_to_id(item.uid)
        if content_hash != self.hashes.get(item.uid, None):
            spider.logger.debug(f"D{doc_id:05d} ({item.uid}) has changed - updating Meilisearch")
            self.batch.append({
                "id"     : doc_id,
                "url"    : item.url,
                "title"  : item.title,
                "content": item.content,
                "source" : item.source,
            })
            self.hashes[item.uid] = content_hash
        else:
            spider.logger.debug(f"D{doc_id:05d} ({item.uid}) is unchanged ({content_hash})")
        return item

    def flush(self, force=False):
        if len(self.batch) >= ([self.MEILI_BATCH_SIZE, 1][force]):
            self.m_index.add_documents(self.batch)
            self.batch = []
