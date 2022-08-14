class Search {

    // Meilisearch credentials
    MS_HOST     = "http://meilisearch.example.com:7700";
    MS_API_KEY  = "abcdefg12345678";

    // How long to wait after the last keystroke before triggering search
    TIMEOUT_MS  = 500;

    // How many items to show on a single page
    PAGE_LIMIT  = 30;

    // How many words to include in the content returned by Meilisearch
    CROP_LENGTH = 30;

    constructor() {
        // Pickup common page elements
        this.search_bar     = document.getElementById("search-bar");
        this.search_spin    = document.getElementById("search-spin");
        this.search_text    = document.getElementById("search-text");
        this.search_summary = document.getElementById("search-summary");
        this.search_result  = document.getElementById("search-result");
        this.search_sources = document.getElementById("search-sources");
        this.search_pages   = document.getElementById("search-pages");
        this.search_pg_sel  = document.getElementById("search-page-selector");
        // Pre-render templates
        this.tmpl_entry  = this.compile_template("entry");
        this.tmpl_page   = this.compile_template("page");
        this.tmpl_source = this.compile_template("source");
        // Setup initial state
        this.current_mode = "welcome";
        this.input_timer  = null;
        this.max_page     = 0;
        this.page_index   = 0;
        this.focus        = null;
        this.filter       = [];
        // Initial the mode
        this.set_mode();
        // Setup trigger on input text box
        this.search_text.addEventListener("input", () => { this.capture_input() });
        // Create Meilisearch client
        this.m_client = new MeiliSearch({
            host  : this.MS_HOST,
            apiKey: this.MS_API_KEY
        });
        this.m_index = this.m_client.index("docs");
        // Focus the search box
        this.search_text.focus();
        // Capture keyboard presses
        document.addEventListener("keydown", (evt) => {
            this.keyboard(evt);
        });
        // Clear keyboard focus if mouse moves
        this.last_mouse_pos = [0, 0];
        document.addEventListener("mousemove", (evt) => {
            if (evt.clientX != this.last_mouse_pos[0] ||
                evt.clientY != this.last_mouse_pos[1]) {
                this.defocus();
                this.last_mouse_pos = [evt.clientX, evt.clientY];
            }
        });
    }

    /**
     * Handle keyboard events to support hot key actions for searching and then
     * navigating results.
     * @param {Event} evt
     */
    keyboard(evt) {
        let unfocused = (document.activeElement != this.search_text);
        // Only capture key events when unfocused
        if (unfocused) {
            // If on the welcome screen, any key refocuses
            if (this.current_mode == "welcome") {
                this.search_text.focus();
            // Activate search box when '/' pressed
            } else if (evt.key == "/") {
                this.defocus();
                this.search_text.focus();
                evt.preventDefault();
            // Skip to next/previous page if 'n'/'p' pressed
            } else if (evt.key == "n" || evt.key == "p") {
                if (evt.key == "n" && this.page_index < (this.max_page - 1)) {
                    this.page_index += 1;
                } else if (evt.key == "p" && this.page_index > 0) {
                    this.page_index -= 1;
                }
                window.scrollTo(0, 0);
                this.search();
                evt.preventDefault();
            // When return key hit, go to link of highlighted entry
            } else if (evt.key == "Enter" && this.focus != null) {
                this.focus.onclick();
                evt.preventDefault();
            // Pressing 'd' toggles dark mode
            } else if (evt.key == "d") {
                document.getElementsByTagName("body")[0].classList.toggle("dark");
                evt.preventDefault();
            }
        }
        // Clear search with ESC
        if (evt.key == "Escape") {
            this.search_text.focus();
            this.search_text.value = "";
            this.capture_input();
            evt.preventDefault();
        }
        // Navigate results with up & down arrows
        if (evt.key == "ArrowUp" || evt.key == "ArrowDown") {
            if (this.focus == null || !unfocused) {
                this.focus = document.getElementsByClassName("search-entry")[0];
                this.focus.classList.add("focus");
                this.search_text.blur();
            } else {
                if (evt.key == "ArrowUp" && this.focus.previousElementSibling) {
                    this.focus.classList.remove("focus");
                    this.focus = this.focus.previousElementSibling;
                    this.focus.classList.add("focus");
                } else if (evt.key == "ArrowDown" && this.focus.nextElementSibling) {
                    this.focus.classList.remove("focus");
                    this.focus = this.focus.nextElementSibling;
                    this.focus.classList.add("focus");
                }
                window.scrollTo(0, this.focus.offsetTop - 200);
            }
            evt.preventDefault();
        }
    }

    /**
     * Defocus from the entry which has been selected by hot keys
     */
    defocus() {
        if (this.focus != null) {
            this.focus.classList.remove("focus");
            this.focus = null;
        }
    }

    /**
     * Convenience method use to compile Handlebars templates
     * @param {string} name Suffix of the template name to compile
     * @returns             Compile Handlebars template
     */
    compile_template(name) {
        return Handlebars.compile(document.getElementById("template-" + name).innerHTML);
    }

    /**
     * Change the mode and optionally start a countdown timer to begin searching
     * as characters are entered into the search box
     */
    capture_input() {
        // Clear timer if one is running
        if (this.input_timer != null) {
            window.clearTimeout(this.input_timer);
            this.input_timer = null;
        }
        // Always reset page index & filter
        this.page_index = 0;
        this.filter     = [];
        // If any text entered, move to pending state
        if (this.search_text.value.length > 0) {
            this.set_mode("pending");
            this.input_timer = window.setTimeout(() => { this.search() }, this.TIMEOUT_MS);
        // If text box empty, move to welcome state & clear result box
        } else {
            this.search_result.innerHTML = "";
            this.set_mode("welcome");
        }
    }

    /**
     * Change between modes of operation
     * @param {string} mode Either 'welcome', 'pending', or 'results'
     */
    set_mode(mode = "welcome") {
        if (mode != this.current_mode) {
            // Transition between search box being in center & at top of screen
            if (mode == "welcome") {
                this.search_bar.classList.remove("compact");
            } else {
                this.search_bar.classList.add("compact");
            }
            // Transition between showing spinner or not
            if (mode == "pending") {
                this.search_spin.classList.add("visible");
            } else {
                this.search_spin.classList.remove("visible");
            }
            // Remember the current mode
            this.current_mode = mode;
        }
    }

    /**
     * Perform the search using an asynchronous call to the Meilisearch database
     * and then call 'draw' with the results
     */
    search() {
        this.input_timer = null;
        this.focus       = null;
        (async (inst, search_term) => {
            let search = await inst.m_index.search(search_term, {
                filter               : inst.filter,
                limit                : inst.PAGE_LIMIT,
                offset               : inst.page_index * inst.PAGE_LIMIT,
                attributesToRetrieve : ["title", "url", "source"],
                attributesToCrop     : ["content"],
                attributesToHighlight: ["content"],
                cropLength           : inst.CROP_LENGTH,
            });
            inst.draw(search);

        })(this, this.search_text.value);
    }

    /**
     * Render a Meilisearch query result, updating the summary, sources list,
     * pagination, and the result entries
     * @param {Object} result Search result object from the Meilisearch database
     */
    draw(result) {
        // Reset the result box
        this.search_result.innerHTML = "";
        // Write out summary
        let min_result = result.offset + 1;
        let max_result = min_result + result.hits.length - 1;
        let all_result = result.estimatedTotalHits;
        this.search_summary.innerText = (
            `Showing results ${min_result} to ${max_result} of ${all_result}`
        );
        // Draw the results
        const source_counts = {};
        for (const item of result.hits) {
            this.search_result.innerHTML += this.tmpl_entry(item._formatted);
            source_counts[item.source] = (source_counts[item.source] || 0) + 1;
        }
        // Setup sources list
        this.search_sources.innerHTML = this.tmpl_source({ key  : "all",
                                                           name : "All",
                                                           count: all_result,
                                                           focus: (this.filter.length == 0) });
        for (const [key, val] of Object.entries(source_counts)) {
            this.search_sources.innerHTML += this.tmpl_source({
                key  : key,
                name : key.charAt(0).toUpperCase() + key.slice(1).toLowerCase(),
                count: val,
                focus: (this.filter[0] == `source = '${key}'`)
            });
        }
        // Setup pagination
        if (result.estimatedTotalHits > this.PAGE_LIMIT) {
            this.search_pg_sel.innerHTML = "";
            this.search_pg_sel.innerHTML += this.tmpl_page({
                text    : "&laquo;",
                number  : (this.page_index - 1),
                active  : false,
                disabled: (this.page_index <= 0)
            });
            this.max_page = Math.ceil(result.estimatedTotalHits / this.PAGE_LIMIT);
            for (let idx = 0; idx < this.max_page; idx++) {
                this.search_pg_sel.innerHTML += this.tmpl_page({
                    text    : idx + 1,
                    number  : idx,
                    active  : (idx == this.page_index),
                    disabled: false
                });
            }
            this.search_pg_sel.innerHTML += this.tmpl_page({
                text    : "&raquo;",
                number  : (this.page_index + 1),
                active  : false,
                disabled: (this.page_index >= this.max_page)
            });
            this.search_pages.style.display = "block";
        } else {
            this.search_pages.style.display = "none";
        }
        // Hide the spinner
        this.set_mode("results");
    }

    /**
     * Change between pages of results by updating the page index and then
     * retriggering the search operation
     * @param {integer} number Page of results to show
     */
    set_page(number = 0) {
        this.page_index = parseInt(number);
        this.search();
    }

    /**
     * Set the source filter to a provided key
     * @param {string} key  Either 'all' to show every result, or the name of a
     *                      particular data source (e.g. 'docs')
     */
    set_filter(key) {
        if (key == "all") {
            this.filter = [];
        } else {
            this.filter = [`source = '${key}'`];
        }
        this.search();
    }

};

const instances = {};
window.addEventListener("load", () => {
    instances.search = new Search();
    if (window.matchMedia("(prefers-color-scheme:dark)").matches) {
        document.getElementsByTagName("body")[0].classList.add("dark");
    }
});
