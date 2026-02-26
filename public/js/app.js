/* =============================================
   Dataset Builder by Tryll Engine
   Main Application
   ============================================= */

// =============================================
// CONFIG
// =============================================
const CONFIG = {
  STORAGE_KEY: 'lootforge_data',
  DEFAULT_LICENSE: 'CC BY-NC-SA 3.0',
};

// =============================================
// UTILS
// =============================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const uid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

// =============================================
// STORE — State management with localStorage
// =============================================
class Store {
  constructor() {
    this.data = this._load();
    this._listeners = [];
  }

  _load() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to load state:', e);
    }
    return { projects: [], currentProjectId: null };
  }

  _save() {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.data));
    this._notify();
  }

  _notify() {
    this._listeners.forEach(fn => fn());
  }

  onChange(fn) {
    this._listeners.push(fn);
  }

  // ---- PROJECTS ----

  getProjects() {
    return this.data.projects;
  }

  getCurrentProject() {
    if (!this.data.currentProjectId) return null;
    return this.data.projects.find(p => p.id === this.data.currentProjectId) || null;
  }

  createProject(name) {
    const project = {
      id: uid(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      categories: [],
    };
    this.data.projects.push(project);
    this.data.currentProjectId = project.id;
    this._save();
    return project;
  }

  selectProject(id) {
    this.data.currentProjectId = id;
    this._save();
  }

  deleteProject(id) {
    this.data.projects = this.data.projects.filter(p => p.id !== id);
    if (this.data.currentProjectId === id) {
      this.data.currentProjectId = this.data.projects.length ? this.data.projects[0].id : null;
    }
    this._save();
  }

  // ---- CATEGORIES ----

  getCategories() {
    const project = this.getCurrentProject();
    return project ? project.categories : [];
  }

  addCategory(name) {
    const project = this.getCurrentProject();
    if (!project) return null;
    const cat = {
      id: uid(),
      name: name.trim(),
      expanded: true,
      chunks: [],
    };
    project.categories.push(cat);
    this._save();
    return cat;
  }

  deleteCategory(catId) {
    const project = this.getCurrentProject();
    if (!project) return;
    project.categories = project.categories.filter(c => c.id !== catId);
    this._save();
  }

  renameCategory(catId, newName) {
    const project = this.getCurrentProject();
    if (!project) return;
    const cat = project.categories.find(c => c.id === catId);
    if (cat) {
      cat.name = newName.trim();
      this._save();
    }
  }

  toggleCategory(catId) {
    const project = this.getCurrentProject();
    if (!project) return;
    const cat = project.categories.find(c => c.id === catId);
    if (cat) {
      cat.expanded = !cat.expanded;
      this._save();
    }
  }

  // ---- CHUNKS ----

  addChunk(catId) {
    const project = this.getCurrentProject();
    if (!project) return null;
    const cat = project.categories.find(c => c.id === catId);
    if (!cat) return null;
    const chunk = {
      _uid: uid(),
      id: '',
      text: '',
      metadata: {
        page_title: '',
        source: '',
        license: CONFIG.DEFAULT_LICENSE,
      },
      customFields: [],
    };
    cat.chunks.push(chunk);
    this._save();
    return { categoryId: catId, chunkUid: chunk._uid };
  }

  getChunk(catId, chunkUid) {
    const project = this.getCurrentProject();
    if (!project) return null;
    const cat = project.categories.find(c => c.id === catId);
    if (!cat) return null;
    return cat.chunks.find(ch => ch._uid === chunkUid) || null;
  }

  updateChunk(catId, chunkUid, data) {
    const project = this.getCurrentProject();
    if (!project) return;
    const cat = project.categories.find(c => c.id === catId);
    if (!cat) return;
    const idx = cat.chunks.findIndex(ch => ch._uid === chunkUid);
    if (idx === -1) return;
    cat.chunks[idx] = { ...cat.chunks[idx], ...data };
    this._save();
  }

  deleteChunk(catId, chunkUid) {
    const project = this.getCurrentProject();
    if (!project) return;
    const cat = project.categories.find(c => c.id === catId);
    if (!cat) return;
    cat.chunks = cat.chunks.filter(ch => ch._uid !== chunkUid);
    this._save();
  }

  duplicateChunk(catId, chunkUid) {
    const project = this.getCurrentProject();
    if (!project) return null;
    const cat = project.categories.find(c => c.id === catId);
    if (!cat) return null;
    const orig = cat.chunks.find(ch => ch._uid === chunkUid);
    if (!orig) return null;
    const copy = JSON.parse(JSON.stringify(orig));
    copy._uid = uid();
    copy.id = orig.id ? orig.id + '_copy' : '';
    cat.chunks.push(copy);
    this._save();
    return { categoryId: catId, chunkUid: copy._uid };
  }

  // ---- COUNTS ----

  getTotalChunks() {
    const project = this.getCurrentProject();
    if (!project) return 0;
    return project.categories.reduce((sum, cat) => sum + cat.chunks.length, 0);
  }

  isChunkIdTaken(id, excludeUid) {
    if (!id) return false;
    const project = this.getCurrentProject();
    if (!project) return false;
    for (const cat of project.categories) {
      for (const chunk of cat.chunks) {
        if (chunk._uid !== excludeUid && chunk.id === id) return true;
      }
    }
    return false;
  }

  // ---- IMPORT ----

  importProject(name, jsonArray) {
    const STANDARD_META = new Set(['page_title', 'source', 'license']);

    const project = {
      id: uid(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      categories: [],
    };

    // Single category for all imported chunks
    const category = {
      id: uid(),
      name: 'Imported',
      expanded: true,
      chunks: [],
    };

    for (const entry of jsonArray) {
      const meta = entry.metadata || {};
      const customFields = [];

      // Separate standard from custom metadata
      for (const [key, value] of Object.entries(meta)) {
        if (!STANDARD_META.has(key)) {
          customFields.push({ key, value: String(value ?? '') });
        }
      }

      category.chunks.push({
        _uid: uid(),
        id: entry.id || '',
        text: entry.text || '',
        metadata: {
          page_title: meta.page_title || '',
          source: meta.source || '',
          license: meta.license || '',
        },
        customFields,
      });
    }

    project.categories.push(category);
    this.data.projects.push(project);
    this.data.currentProjectId = project.id;
    this._save();
    return project;
  }

  // ---- EXPORT ----

  exportJSON() {
    const project = this.getCurrentProject();
    if (!project) return null;
    const result = [];
    for (const cat of project.categories) {
      for (const chunk of cat.chunks) {
        const entry = {
          id: chunk.id,
          text: chunk.text,
          metadata: { ...chunk.metadata },
        };
        // merge custom fields into metadata
        if (chunk.customFields) {
          for (const cf of chunk.customFields) {
            if (cf.key && cf.key.trim()) {
              entry.metadata[cf.key.trim()] = cf.value || '';
            }
          }
        }
        result.push(entry);
      }
    }
    return result;
  }
}

// =============================================
// APP — UI Controller
// =============================================
class App {
  constructor() {
    this.store = new Store();
    this.selected = null; // { categoryId, chunkUid }
    this._init();
  }

  _init() {
    this._cacheEls();
    this._bindEvents();
    this.store.onChange(() => this.render());
    this.render();
  }

  _cacheEls() {
    this.els = {
      projectSelect: $('#projectSelect'),
      newProjectBtn: $('#newProjectBtn'),
      deleteProjectBtn: $('#deleteProjectBtn'),
      addCategoryBtn: $('#addCategoryBtn'),
      newCategoryWrap: $('#newCategoryWrap'),
      newCategoryName: $('#newCategoryName'),
      confirmCategoryBtn: $('#confirmCategoryBtn'),
      cancelCategoryBtn: $('#cancelCategoryBtn'),
      categoryTree: $('#categoryTree'),
      content: $('#content'),
      exportBtn: $('#exportBtn'),
      modalOverlay: $('#modalOverlay'),
      modalContent: $('#modalContent'),
      toastContainer: $('#toastContainer'),
      chunkCountValue: $('#chunkCountValue'),
      importProjectBtn: $('#importProjectBtn'),
      importFileInput: $('#importFileInput'),
    };
  }

  _bindEvents() {
    // Project select
    this.els.projectSelect.addEventListener('change', (e) => {
      this.selected = null;
      this.store.selectProject(e.target.value);
    });

    // New project
    this.els.newProjectBtn.addEventListener('click', () => this._showNewProjectModal());

    // Import project
    this.els.importProjectBtn.addEventListener('click', () => this.els.importFileInput.click());
    this.els.importFileInput.addEventListener('change', (e) => this._handleImport(e));

    // Delete project
    this.els.deleteProjectBtn.addEventListener('click', () => this._handleDeleteProject());

    // Categories
    this.els.addCategoryBtn.addEventListener('click', () => this._showCategoryInput());
    this.els.confirmCategoryBtn.addEventListener('click', () => this._confirmCategory());
    this.els.cancelCategoryBtn.addEventListener('click', () => this._hideCategoryInput());
    this.els.newCategoryName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._confirmCategory();
      if (e.key === 'Escape') this._hideCategoryInput();
    });

    // Category tree — delegated events
    this.els.categoryTree.addEventListener('click', (e) => this._handleTreeClick(e));

    // Export
    this.els.exportBtn.addEventListener('click', () => this._handleExport());

    // Modal overlay click to close
    this.els.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.els.modalOverlay) this._closeModal();
    });

    // ESC to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._closeModal();
    });
  }

  // ---- RENDER ----

  render() {
    this._renderProjectSelect();
    this._renderCategories();
    this._renderContent();
    this._renderChunkCount();
  }

  _renderProjectSelect() {
    const projects = this.store.getProjects();
    const currentId = this.store.data.currentProjectId;
    let html = '<option value="" disabled>— Select Project —</option>';
    for (const p of projects) {
      const sel = p.id === currentId ? 'selected' : '';
      html += `<option value="${p.id}" ${sel}>${this._esc(p.name)}</option>`;
    }
    this.els.projectSelect.innerHTML = html;
    if (!currentId && projects.length === 0) {
      this.els.projectSelect.value = '';
    }
  }

  _renderCategories() {
    const cats = this.store.getCategories();
    if (!this.store.getCurrentProject()) {
      this.els.categoryTree.innerHTML = `
        <div style="padding:20px 16px;text-align:center;">
          <p style="color:var(--text-muted);font-size:12px;">Create or select a project to begin</p>
        </div>`;
      return;
    }
    if (cats.length === 0) {
      this.els.categoryTree.innerHTML = `
        <div style="padding:20px 16px;text-align:center;">
          <p style="color:var(--text-muted);font-size:12px;">No categories yet.<br>Hit <strong>+</strong> to create one!</p>
        </div>`;
      return;
    }

    let html = '';
    for (const cat of cats) {
      const expanded = cat.expanded;
      const isActive = this.selected && this.selected.categoryId === cat.id;
      html += `
        <div class="category-item" data-cat-id="${cat.id}">
          <div class="category-header ${isActive ? 'active' : ''}">
            <i class="bi bi-chevron-right category-chevron ${expanded ? 'expanded' : ''}" data-action="toggle" data-cat-id="${cat.id}"></i>
            <i class="bi bi-folder2-open category-icon"></i>
            <span class="category-name" data-action="toggle" data-cat-id="${cat.id}">${this._esc(cat.name)}</span>
            <span class="category-count">${cat.chunks.length}</span>
            <div class="category-actions">
              <button class="btn-icon btn-icon--accent" data-action="add-chunk" data-cat-id="${cat.id}" title="Add Chunk"><i class="bi bi-plus-lg"></i></button>
              <button class="btn-icon btn-icon--danger" data-action="delete-cat" data-cat-id="${cat.id}" title="Delete Category"><i class="bi bi-trash3"></i></button>
            </div>
          </div>
          <div class="chunk-list ${expanded ? '' : 'collapsed'}" id="chunks-${cat.id}">`;

      for (const chunk of cat.chunks) {
        const isSelected = this.selected && this.selected.chunkUid === chunk._uid;
        const label = chunk.id || 'untitled chunk';
        html += `
            <div class="chunk-item ${isSelected ? 'selected' : ''}" data-action="select-chunk" data-cat-id="${cat.id}" data-chunk-uid="${chunk._uid}">
              <i class="bi bi-file-earmark-text chunk-item-icon"></i>
              <span class="chunk-item-name">${this._esc(label)}</span>
              <button class="btn-icon btn-icon--danger chunk-item-delete" data-action="delete-chunk" data-cat-id="${cat.id}" data-chunk-uid="${chunk._uid}" title="Delete"><i class="bi bi-x-lg"></i></button>
            </div>`;
      }

      html += `
            <button class="add-chunk-btn" data-action="add-chunk" data-cat-id="${cat.id}">
              <i class="bi bi-plus"></i> Add chunk
            </button>
          </div>
        </div>`;
    }
    this.els.categoryTree.innerHTML = html;

    // set max-height for expanded lists to animate
    for (const cat of cats) {
      const el = $(`#chunks-${cat.id}`);
      if (el && cat.expanded) {
        el.style.maxHeight = el.scrollHeight + 'px';
      }
    }
  }

  _renderContent() {
    const project = this.store.getCurrentProject();

    // No project
    if (!project) {
      this.els.content.innerHTML = `
        <div class="welcome-screen">
          <div class="welcome-logo"><img src="/img/logo.png" alt="Tryll Engine" class="welcome-logo-img"></div>
          <div class="welcome-title">Dataset <span class="accent">Builder</span></div>
          <p class="welcome-desc">
            by Tryll Engine<br><br>
            Create a project to start building your knowledge base — one chunk at a time.
          </p>
          <div style="display:flex;gap:12px;margin-top:8px;">
            <button class="btn btn-accent" id="welcomeNewProject">
              <i class="bi bi-plus-lg"></i> New Project
            </button>
            <button class="btn btn-secondary" id="welcomeImport">
              <i class="bi bi-upload"></i> Import JSON
            </button>
          </div>
        </div>`;
      const btn = $('#welcomeNewProject');
      if (btn) btn.addEventListener('click', () => this._showNewProjectModal());
      const impBtn = $('#welcomeImport');
      if (impBtn) impBtn.addEventListener('click', () => this.els.importFileInput.click());
      return;
    }

    // No selection
    if (!this.selected) {
      this.els.content.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="bi bi-box-seam"></i></div>
          <div class="empty-state-title">Your inventory is empty</div>
          <p class="empty-state-text">
            Select a chunk from the sidebar to edit it, or create a new category and add chunks to start building your database.
          </p>
        </div>`;
      return;
    }

    // Chunk editor
    const chunk = this.store.getChunk(this.selected.categoryId, this.selected.chunkUid);
    if (!chunk) {
      this.selected = null;
      this._renderContent();
      return;
    }

    const customFieldsHtml = (chunk.customFields || []).map((cf, i) => `
      <div class="custom-field-row">
        <input class="field-input custom-field-key" type="text" placeholder="Field name" value="${this._escAttr(cf.key)}" data-cf-index="${i}" data-cf-part="key">
        <input class="field-input" type="text" placeholder="Value" value="${this._escAttr(cf.value)}" data-cf-index="${i}" data-cf-part="value">
        <button class="btn-icon btn-icon--danger" data-action="remove-cf" data-cf-index="${i}" title="Remove field"><i class="bi bi-x-lg"></i></button>
      </div>
    `).join('');

    this.els.content.innerHTML = `
      <div class="chunk-editor">
        <div class="editor-header">
          <div class="editor-title">
            <i class="bi bi-file-earmark-code"></i>
            Chunk Editor
          </div>
          <div class="editor-actions">
            <button class="btn btn-ghost" id="duplicateChunkBtn" title="Duplicate">
              <i class="bi bi-copy"></i> Duplicate
            </button>
            <button class="btn btn-danger" id="deleteChunkBtn">
              <i class="bi bi-trash3"></i> Delete
            </button>
          </div>
        </div>

        <!-- Core fields -->
        <div class="editor-card">
          <div class="editor-card-title"><i class="bi bi-tag"></i> Core Data</div>
          <div class="field-group">
            <label class="field-label">ID</label>
            <input class="field-input" type="text" id="chunkId" placeholder="e.g. sword_basic" value="${this._escAttr(chunk.id)}">
          </div>
          <div class="field-group">
            <label class="field-label">Text</label>
            <textarea class="field-textarea" id="chunkText" placeholder="Main chunk content..." maxlength="2000">${this._esc(chunk.text)}</textarea>
            <div class="char-counter" id="charCounter"><span id="charCount">${(chunk.text || '').length}</span> / 2000</div>
          </div>
        </div>

        <!-- Metadata -->
        <div class="editor-card">
          <div class="editor-card-title"><i class="bi bi-database"></i> Metadata</div>
          <div class="field-group">
            <label class="field-label">Page Title</label>
            <input class="field-input" type="text" id="metaPageTitle" placeholder="Page title" value="${this._escAttr(chunk.metadata.page_title)}">
          </div>
          <div class="field-group">
            <label class="field-label">Source</label>
            <input class="field-input" type="text" id="metaSource" placeholder="Source URL or name" value="${this._escAttr(chunk.metadata.source)}">
          </div>
          <div class="field-group">
            <label class="field-label">License</label>
            <input class="field-input" type="text" id="metaLicense" placeholder="License type" value="${this._escAttr(chunk.metadata.license)}">
          </div>
        </div>

        <!-- Custom fields -->
        <div class="editor-card">
          <div class="editor-card-title"><i class="bi bi-sliders"></i> Custom Fields</div>
          <div id="customFieldsContainer">
            ${customFieldsHtml}
          </div>
          <button class="add-field-btn" id="addCustomFieldBtn">
            <i class="bi bi-plus-lg"></i> Add Custom Field
          </button>
        </div>

        <!-- Save bar -->
        <div class="editor-save-bar">
          <button class="btn btn-accent btn-block" id="saveChunkBtn">
            <i class="bi bi-check-lg"></i> Save Chunk
          </button>
        </div>
      </div>`;

    // Bind editor events
    this._bindEditorEvents();
  }

  _renderChunkCount() {
    this.els.chunkCountValue.textContent = this.store.getTotalChunks();
  }

  // ---- EDITOR EVENTS ----

  _bindEditorEvents() {
    const saveBtn = $('#saveChunkBtn');
    const deleteBtn = $('#deleteChunkBtn');
    const duplicateBtn = $('#duplicateChunkBtn');
    const addCfBtn = $('#addCustomFieldBtn');
    const cfContainer = $('#customFieldsContainer');

    if (saveBtn) saveBtn.addEventListener('click', () => this._saveCurrentChunk());
    if (deleteBtn) deleteBtn.addEventListener('click', () => this._deleteCurrentChunk());
    if (duplicateBtn) duplicateBtn.addEventListener('click', () => this._duplicateCurrentChunk());
    if (addCfBtn) addCfBtn.addEventListener('click', () => this._addCustomField());

    // Character counter for text field
    const chunkText = $('#chunkText');
    const charCount = $('#charCount');
    const charCounter = $('#charCounter');
    if (chunkText && charCount) {
      chunkText.addEventListener('input', () => {
        const len = chunkText.value.length;
        charCount.textContent = len;
        charCounter.classList.toggle('char-counter--warn', len >= 1800);
        charCounter.classList.toggle('char-counter--limit', len >= 2000);
      });
    }

    // Remove custom field (delegated)
    if (cfContainer) {
      cfContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="remove-cf"]');
        if (btn) {
          const idx = parseInt(btn.dataset.cfIndex, 10);
          this._removeCustomField(idx);
        }
      });
    }

    // Ctrl+S to save
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this._saveCurrentChunk();
      }
    };
    // Clean up old handler
    if (this._ctrlSHandler) document.removeEventListener('keydown', this._ctrlSHandler);
    this._ctrlSHandler = handler;
    document.addEventListener('keydown', handler);
  }

  // ---- TREE CLICK HANDLER ----

  _handleTreeClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const catId = target.dataset.catId;
    const chunkUid = target.dataset.chunkUid;

    switch (action) {
      case 'toggle':
        this.store.toggleCategory(catId);
        break;
      case 'add-chunk':
        e.stopPropagation();
        this._handleAddChunk(catId);
        break;
      case 'delete-cat':
        e.stopPropagation();
        this._handleDeleteCategory(catId);
        break;
      case 'select-chunk':
        this.selected = { categoryId: catId, chunkUid };
        this.render();
        break;
      case 'delete-chunk':
        e.stopPropagation();
        this._handleDeleteChunkFromTree(catId, chunkUid);
        break;
    }
  }

  // ---- PROJECT ACTIONS ----

  _showNewProjectModal() {
    this.els.modalContent.innerHTML = `
      <div class="modal-title"><i class="bi bi-rocket-takeoff"></i> New Project</div>
      <p class="modal-text">Give your project a name. This will be the filename when you export.</p>
      <input class="modal-input" type="text" id="modalProjectName" placeholder="e.g. weapons_database" maxlength="100" autofocus>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modalCancel">Cancel</button>
        <button class="btn btn-accent" id="modalConfirm"><i class="bi bi-plus-lg"></i> Create</button>
      </div>`;
    this.els.modalOverlay.classList.remove('hidden');

    const input = $('#modalProjectName');
    const confirm = $('#modalConfirm');
    const cancel = $('#modalCancel');

    setTimeout(() => input.focus(), 100);

    const create = () => {
      const name = input.value.trim();
      if (!name) {
        input.style.borderColor = 'var(--danger)';
        return;
      }
      this.selected = null;
      this.store.createProject(name);
      this._closeModal();
      this._toast('Project created!', 'success');
    };

    confirm.addEventListener('click', create);
    cancel.addEventListener('click', () => this._closeModal());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') create();
      if (e.key === 'Escape') this._closeModal();
    });
  }

  _handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    // Reset input so same file can be re-imported
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);

        // Validate: must be an array of objects with at least `id`
        if (!Array.isArray(parsed)) {
          this._toast('Invalid format: expected a JSON array.', 'error');
          return;
        }
        if (parsed.length === 0) {
          this._toast('JSON array is empty — nothing to import.', 'error');
          return;
        }

        const projectName = file.name.replace(/\.json$/i, '');
        const project = this.store.importProject(projectName, parsed);
        this.selected = null;
        this.render();
        this._toast(`Imported! ${parsed.length} chunks loaded into "${project.name}".`, 'success');
      } catch (err) {
        this._toast('Failed to parse JSON: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  _handleDeleteProject() {
    const project = this.store.getCurrentProject();
    if (!project) return;

    this.els.modalContent.innerHTML = `
      <div class="modal-title"><i class="bi bi-exclamation-triangle" style="color:var(--danger)"></i> Delete Project</div>
      <p class="modal-text">Are you sure you want to delete <strong>${this._esc(project.name)}</strong>? This will remove all categories and chunks. This action cannot be undone.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modalCancel">Cancel</button>
        <button class="btn btn-danger" id="modalConfirm"><i class="bi bi-trash3"></i> Delete</button>
      </div>`;
    this.els.modalOverlay.classList.remove('hidden');

    $('#modalConfirm').addEventListener('click', () => {
      this.selected = null;
      this.store.deleteProject(project.id);
      this._closeModal();
      this._toast('Project deleted.', 'info');
    });
    $('#modalCancel').addEventListener('click', () => this._closeModal());
  }

  // ---- CATEGORY ACTIONS ----

  _showCategoryInput() {
    if (!this.store.getCurrentProject()) {
      this._toast('Create a project first!', 'error');
      return;
    }
    this.els.newCategoryWrap.classList.remove('hidden');
    this.els.newCategoryName.value = '';
    this.els.newCategoryName.focus();
  }

  _hideCategoryInput() {
    this.els.newCategoryWrap.classList.add('hidden');
    this.els.newCategoryName.value = '';
  }

  _confirmCategory() {
    const name = this.els.newCategoryName.value.trim();
    if (!name) return;
    this.store.addCategory(name);
    this._hideCategoryInput();
    this._toast(`Category "${name}" created!`, 'success');
  }

  _handleDeleteCategory(catId) {
    const cats = this.store.getCategories();
    const cat = cats.find(c => c.id === catId);
    if (!cat) return;

    if (cat.chunks.length > 0) {
      this.els.modalContent.innerHTML = `
        <div class="modal-title"><i class="bi bi-exclamation-triangle" style="color:var(--danger)"></i> Delete Category</div>
        <p class="modal-text">Category <strong>${this._esc(cat.name)}</strong> has ${cat.chunks.length} chunk(s). Deleting it will remove all chunks inside. Continue?</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="modalCancel">Cancel</button>
          <button class="btn btn-danger" id="modalConfirm"><i class="bi bi-trash3"></i> Delete</button>
        </div>`;
      this.els.modalOverlay.classList.remove('hidden');

      $('#modalConfirm').addEventListener('click', () => {
        if (this.selected && this.selected.categoryId === catId) this.selected = null;
        this.store.deleteCategory(catId);
        this._closeModal();
        this._toast('Category deleted.', 'info');
      });
      $('#modalCancel').addEventListener('click', () => this._closeModal());
    } else {
      if (this.selected && this.selected.categoryId === catId) this.selected = null;
      this.store.deleteCategory(catId);
      this._toast('Category deleted.', 'info');
    }
  }

  // ---- CHUNK ACTIONS ----

  _handleAddChunk(catId) {
    const result = this.store.addChunk(catId);
    if (!result) return;
    // Ensure category is expanded
    const cat = this.store.getCategories().find(c => c.id === catId);
    if (cat && !cat.expanded) this.store.toggleCategory(catId);
    // Select the new chunk
    this.selected = result;
    this.render();
    // Focus ID field
    setTimeout(() => {
      const idInput = $('#chunkId');
      if (idInput) idInput.focus();
    }, 50);
    this._toast('New chunk created. Fill it in!', 'success');
  }

  _saveCurrentChunk() {
    if (!this.selected) return;

    const idVal = ($('#chunkId') || {}).value || '';
    const textVal = ($('#chunkText') || {}).value || '';
    const pageTitle = ($('#metaPageTitle') || {}).value || '';
    const source = ($('#metaSource') || {}).value || '';
    const license = ($('#metaLicense') || {}).value || '';

    // Check for duplicate ID
    if (idVal && this.store.isChunkIdTaken(idVal, this.selected.chunkUid)) {
      this._toast('This ID already exists. Try adding _1, _2, etc.', 'error');
      const idInput = $('#chunkId');
      if (idInput) idInput.style.borderColor = 'var(--danger)';
      return;
    }

    // Gather custom fields
    const customFields = [];
    const cfRows = $$('.custom-field-row');
    cfRows.forEach(row => {
      const keyInput = row.querySelector('[data-cf-part="key"]');
      const valueInput = row.querySelector('[data-cf-part="value"]');
      if (keyInput && valueInput) {
        customFields.push({ key: keyInput.value, value: valueInput.value });
      }
    });

    this.store.updateChunk(this.selected.categoryId, this.selected.chunkUid, {
      id: idVal,
      text: textVal,
      metadata: { page_title: pageTitle, source, license },
      customFields,
    });

    this._toast('Chunk saved!', 'success');
  }

  _deleteCurrentChunk() {
    if (!this.selected) return;
    const chunk = this.store.getChunk(this.selected.categoryId, this.selected.chunkUid);
    const label = chunk ? (chunk.id || 'untitled') : 'this chunk';

    this.els.modalContent.innerHTML = `
      <div class="modal-title"><i class="bi bi-exclamation-triangle" style="color:var(--danger)"></i> Delete Chunk</div>
      <p class="modal-text">Delete <strong>${this._esc(label)}</strong>? This cannot be undone.</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modalCancel">Cancel</button>
        <button class="btn btn-danger" id="modalConfirm"><i class="bi bi-trash3"></i> Delete</button>
      </div>`;
    this.els.modalOverlay.classList.remove('hidden');

    $('#modalConfirm').addEventListener('click', () => {
      this.store.deleteChunk(this.selected.categoryId, this.selected.chunkUid);
      this.selected = null;
      this._closeModal();
      this._toast('Chunk deleted.', 'info');
    });
    $('#modalCancel').addEventListener('click', () => this._closeModal());
  }

  _handleDeleteChunkFromTree(catId, chunkUid) {
    const chunk = this.store.getChunk(catId, chunkUid);
    const label = chunk ? (chunk.id || 'untitled') : 'this chunk';

    this.els.modalContent.innerHTML = `
      <div class="modal-title"><i class="bi bi-exclamation-triangle" style="color:var(--danger)"></i> Delete Chunk</div>
      <p class="modal-text">Delete <strong>${this._esc(label)}</strong>?</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modalCancel">Cancel</button>
        <button class="btn btn-danger" id="modalConfirm"><i class="bi bi-trash3"></i> Delete</button>
      </div>`;
    this.els.modalOverlay.classList.remove('hidden');

    $('#modalConfirm').addEventListener('click', () => {
      if (this.selected && this.selected.chunkUid === chunkUid) this.selected = null;
      this.store.deleteChunk(catId, chunkUid);
      this._closeModal();
      this._toast('Chunk deleted.', 'info');
    });
    $('#modalCancel').addEventListener('click', () => this._closeModal());
  }

  _duplicateCurrentChunk() {
    if (!this.selected) return;
    const result = this.store.duplicateChunk(this.selected.categoryId, this.selected.chunkUid);
    if (result) {
      this.selected = result;
      this.render();
      this._toast('Chunk duplicated!', 'success');
    }
  }

  _addCustomField() {
    if (!this.selected) return;
    // Save current state first to not lose data
    this._saveCurrentChunkSilent();
    const chunk = this.store.getChunk(this.selected.categoryId, this.selected.chunkUid);
    if (!chunk) return;
    if (!chunk.customFields) chunk.customFields = [];
    chunk.customFields.push({ key: '', value: '' });
    this.store._save();
    this._renderContent();
    // Focus the new key input
    setTimeout(() => {
      const inputs = $$('.custom-field-key');
      if (inputs.length) inputs[inputs.length - 1].focus();
    }, 50);
  }

  _removeCustomField(index) {
    if (!this.selected) return;
    this._saveCurrentChunkSilent();
    const chunk = this.store.getChunk(this.selected.categoryId, this.selected.chunkUid);
    if (!chunk || !chunk.customFields) return;
    chunk.customFields.splice(index, 1);
    this.store._save();
    this._renderContent();
  }

  _saveCurrentChunkSilent() {
    if (!this.selected) return;
    const idVal = ($('#chunkId') || {}).value || '';
    const textVal = ($('#chunkText') || {}).value || '';
    const pageTitle = ($('#metaPageTitle') || {}).value || '';
    const source = ($('#metaSource') || {}).value || '';
    const license = ($('#metaLicense') || {}).value || '';
    const customFields = [];
    $$('.custom-field-row').forEach(row => {
      const keyInput = row.querySelector('[data-cf-part="key"]');
      const valueInput = row.querySelector('[data-cf-part="value"]');
      if (keyInput && valueInput) {
        customFields.push({ key: keyInput.value, value: valueInput.value });
      }
    });
    this.store.updateChunk(this.selected.categoryId, this.selected.chunkUid, {
      id: idVal, text: textVal,
      metadata: { page_title: pageTitle, source, license },
      customFields,
    });
  }

  // ---- EXPORT ----

  _handleExport() {
    const project = this.store.getCurrentProject();
    if (!project) {
      this._toast('No project selected!', 'error');
      return;
    }

    // Save any open chunk first
    this._saveCurrentChunkSilent();

    const data = this.store.exportJSON();
    if (!data || data.length === 0) {
      this._toast('No chunks to export. Add some data first!', 'error');
      return;
    }

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this._toast(`Forged! ${data.length} chunks exported.`, 'success');
  }

  // ---- MODAL ----

  _closeModal() {
    this.els.modalOverlay.classList.add('hidden');
  }

  // ---- TOAST ----

  _toast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    const icons = { success: 'bi-check-circle', error: 'bi-x-circle', info: 'bi-info-circle' };
    toast.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i> ${this._esc(message)}`;
    this.els.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // ---- ESCAPE HELPERS ----

  _esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  _escAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

// =============================================
// BOOT
// =============================================
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
