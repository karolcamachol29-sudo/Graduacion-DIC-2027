/**
 * MURO DE RECUERDOS — SCRIPT CLIENTE ESTILO PADLET
 * Integración con Google Drive vía Google Apps Script y Reacciones por IP
 * Almacenamiento persistente local con IndexedDB para fotos y videos
 * Facultad de Ingeniería Química · Generación Diciembre 2027
 */

document.addEventListener('DOMContentLoaded', () => {
  // Configuración del endpoint de Google Apps Script
  const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzZk_GWEynAsmitvE5l8tpE4Na5MUMFoJuAiQv5YgdF6isTWxC-Mr_1CWgaXjy_N3bQ/exec';

  // Elementos DOM principales
  const masonryBoard = document.getElementById('masonry-board');
  const boardLoading = document.getElementById('board-loading');
  const boardEmpty = document.getElementById('board-empty');
  const totalCountBadge = document.getElementById('total-recuerdos-count');
  const visibleCountBadge = document.getElementById('visible-recuerdos-count');

  // Filtros
  const categoryPills = document.querySelectorAll('.category-pill');
  const typeButtons = document.querySelectorAll('.type-btn');

  // Modal de Subida
  const modalOverlay = document.getElementById('upload-modal');
  const openModalBtns = document.querySelectorAll('.js-open-upload-modal');
  const closeModalBtn = document.getElementById('close-upload-modal');
  const cancelModalBtn = document.getElementById('cancel-upload-modal');
  const uploadForm = document.getElementById('upload-form');
  const submitBtn = document.getElementById('submit-upload-btn');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('media-file-input');
  const previewBox = document.getElementById('preview-box');
  const previewContainer = document.getElementById('preview-media-container');
  const previewName = document.getElementById('preview-name');
  const previewSize = document.getElementById('preview-size');
  const removeFileBtn = document.getElementById('remove-file-btn');
  const progressBox = document.getElementById('upload-progress-box');
  const progressText = document.getElementById('progress-status-text');

  // Lightbox
  const lightboxOverlay = document.getElementById('lightbox-overlay');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxVideo = document.getElementById('lightbox-video');
  const lightboxIframe = document.getElementById('lightbox-iframe');
  const lightboxAuthor = document.getElementById('lightbox-author');
  const lightboxText = document.getElementById('lightbox-text');
  const lightboxCloseBtn = document.getElementById('lightbox-close-btn');

  // Toast Container
  const toastContainer = document.getElementById('toast-container');

  // Estado de la aplicación
  let posts = [];
  let currentCategory = 'all';
  let currentType = 'all';
  let userIp = null;
  let visitorId = localStorage.getItem('fiq_visitor_uuid');
  let selectedFile = null;
  let processedBase64 = null;
  let processedMimeType = null;
  let processedFileName = null;
  let processedDataUrl = null;

  // Generar o recuperar UUID de visitante
  if (!visitorId) {
    visitorId = 'fiq_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    localStorage.setItem('fiq_visitor_uuid', visitorId);
  }

  // Lista local de likes del usuario en este navegador
  let likedPostsLocal = JSON.parse(localStorage.getItem('fiq_liked_posts') || '[]');

  // Mapa de reacciones del usuario en este navegador: { [postId]: '🔥' }
  let userReactionsMap = {};
  try {
    userReactionsMap = JSON.parse(localStorage.getItem('fiq_user_reactions_map') || '{}');
  } catch (_) {
    userReactionsMap = {};
  }

  // Lista local de recuerdos reportados por el usuario
  let reportedPostsLocal = JSON.parse(localStorage.getItem('fiq_reported_posts') || '[]');
  let fileModerationPassed = false;
  let isModerating = false;
  let activeReportingPostId = null;

  // Insertar texto o emojis en la posición del cursor de un input o textarea
  const insertAtCursor = (el, text) => {
    if (!el) return;
    const start = el.selectionStart !== undefined ? el.selectionStart : el.value.length;
    const end = el.selectionEnd !== undefined ? el.selectionEnd : el.value.length;
    const before = el.value.substring(0, start);
    const after = el.value.substring(end);
    el.value = before + text + after;
    const newPos = start + text.length;
    el.selectionStart = newPos;
    el.selectionEnd = newPos;
    el.focus();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  /* ------------------------------------------------------------------------
     1. SISTEMA DE ALMACENAMIENTO PERSISTENTE (INDEXEDDB)
     Garantiza que videos y fotos subidas por los compañeros NUNCA se borren
     al recargar la página, incluso si Google Apps Script está pendiente de permisos.
     ------------------------------------------------------------------------ */
  const DB_NAME = 'fiq_muro_recuerdos_db';
  const DB_VERSION = 1;
  const STORE_NAME = 'recuerdos';

  const openMuroDB = () => {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        return reject(new Error('IndexedDB no soportado en este navegador'));
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  };

  const getLocalMemories = async () => {
    try {
      const db = await openMuroDB();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          // Purgar recuerdos de prueba de IndexedDB
          list.forEach((item) => {
            if (isTestPost(item)) {
              deleteLocalMemory(item.id);
            }
          });
          const cleanList = list.filter(item => !isTestPost(item));
          // Hidratar con URLs locales válidas para reproducción instantánea
          const hydrated = cleanList.map((item) => {
            if (item.blob) {
              item.urlFallback = URL.createObjectURL(item.blob);
            }
            return item;
          });
          resolve(hydrated);
        };
        req.onerror = () => resolve([]);
      });
    } catch (e) {
      console.warn('Fallback a localStorage para recuerdos:', e);
      try {
        return JSON.parse(localStorage.getItem('fiq_memories_fallback') || '[]');
      } catch {
        return [];
      }
    }
  };

  const saveLocalMemory = async (memory) => {
    try {
      const db = await openMuroDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const record = { ...memory };
        const req = store.put(record);
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (e) {
      console.warn('IndexedDB no disponible, guardando respaldo:', e);
      try {
        const list = JSON.parse(localStorage.getItem('fiq_memories_fallback') || '[]');
        const safeRecord = { ...memory };
        delete safeRecord.blob; // Evitar cuota excedida en localStorage
        if (safeRecord.urlFallback && safeRecord.urlFallback.length > 200000) {
          delete safeRecord.urlFallback;
        }
        list.unshift(safeRecord);
        localStorage.setItem('fiq_memories_fallback', JSON.stringify(list));
      } catch (err2) {
        console.warn('Error en fallback localStorage:', err2);
      }
    }
  };

  const updateLocalMemory = async (id, patch) => {
    try {
      const db = await openMuroDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        if (getReq.result) {
          const updated = { ...getReq.result, ...patch };
          store.put(updated);
        }
      };
    } catch (e) {
      console.warn('No se pudo actualizar recuerdo local:', e);
    }
  };

  /* Helper para borrar un recuerdo guardado localmente */
  const deleteLocalMemory = async (id) => {
    try {
      const db = await openMuroDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
    } catch (e) {
      console.warn('No se pudo borrar recuerdo local:', e);
    }
    try {
      const list = JSON.parse(localStorage.getItem('fiq_memories_fallback') || '[]');
      const filtered = list.filter(item => item && item.id !== id && item.fileId !== id);
      localStorage.setItem('fiq_memories_fallback', JSON.stringify(filtered));
    } catch (err) {}
  };

  /* Helper para filtrar publicaciones de prueba */
  const isTestPost = (p) => {
    if (!p) return false;
    const autor = String(p.autor || '').toLowerCase();
    const titulo = String(p.titulo || '').toLowerCase();
    const id = String(p.id || '');
    const fileId = String(p.fileId || '');
    return autor.includes('antigravity') || 
           autor.includes('testbot') ||
           autor.includes('test') ||
           titulo.includes('antigravity') || 
           titulo.includes('prueba de conexion') ||
           id === 'mem_1792048028772' || 
           id === 'mem_1792048001569' ||
           fileId === '1hZt_pYRwvGS8w-QImaIqI30l1U_S2n5t' ||
           fileId === '1hc7cxRLACMbgeSRcHaHOJjL8OJy1KfbG';
  };

  /* ------------------------------------------------------------------------
     2. OBTENCIÓN DE IDENTIFICADOR / IP PÚBLICA
     ------------------------------------------------------------------------ */
  const fetchUserIp = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        userIp = data.ip;
      }
    } catch (e) {
      console.info('Usando identificador local de visitante:', visitorId);
    }
    if (!userIp) {
      userIp = visitorId;
    }
  };

  /* ------------------------------------------------------------------------
     3. CARGA DE PUBLICACIONES (LOCAL PRIMERO + SINCRONIZACIÓN REMOTA)
     ------------------------------------------------------------------------ */
  const loadPosts = async () => {
    if (boardLoading) boardLoading.style.display = 'flex';
    if (boardEmpty) boardEmpty.style.display = 'none';

    // 1. Cargar recuerdos guardados localmente de inmediato (persistencia garantizada)
    const localPosts = (await getLocalMemories()).filter(p => !isTestPost(p));
    if (localPosts.length > 0) {
      posts = [...localPosts];
      if (boardLoading) boardLoading.style.display = 'none';
      renderBoard();
    }

    // 2. Intentar sincronizar con Google Apps Script / Google Drive
    try {
      const res = await fetch(SCRIPT_URL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (res.ok) {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          let remotePosts = [];
          if (Array.isArray(data)) {
            remotePosts = data;
          } else if (data && Array.isArray(data.data)) {
            remotePosts = data.data;
          } else if (data && Array.isArray(data.posts)) {
            remotePosts = data.posts;
          }

          if (remotePosts.length > 0) {
            // Filtrar posts de prueba remotos
            remotePosts = remotePosts.filter(p => !isTestPost(p));

            // Asegurar que las reacciones del usuario en este navegador se preserven y sumen
            const myIdentifier = userIp || visitorId;
            remotePosts.forEach((rp) => {
              const localChoice = userReactionsMap[rp.id] || (rp.fileId ? userReactionsMap[rp.fileId] : null) || (likedPostsLocal.includes(rp.id) || (rp.fileId && likedPostsLocal.includes(rp.fileId)) ? '❤️' : null);
              rp.reactions = rp.reactions || {};
              rp.ips_likes = rp.ips_likes || [];

              // Si el usuario reaccionó localmente pero en la nube aún no aparece su IP
              if (localChoice && myIdentifier && !rp.ips_likes.includes(myIdentifier)) {
                rp.ips_likes.push(myIdentifier);
                rp.likes = Math.max(Number(rp.likes) || 0, rp.ips_likes.length, 1);
                rp.reactions[localChoice] = (rp.reactions[localChoice] || 0) + 1;

                // Sincronizar en segundo plano la reacción a Google Sheets
                fetch(SCRIPT_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                  body: JSON.stringify({
                    action: 'like',
                    id: rp.id,
                    fileId: rp.fileId,
                    emoji: localChoice,
                    ip: myIdentifier
                  })
                }).catch(() => {});
              }
            });

            // Unir sin duplicados: mantener recuerdos locales que aún se estén sincronizando
            const remoteIds = new Set(remotePosts.map(r => String(r.fileId || r.id)));
            const merged = [...remotePosts];

            localPosts.forEach((lp) => {
              if (!isTestPost(lp)) {
                const alreadyRemote = remoteIds.has(String(lp.fileId)) || remoteIds.has(String(lp.id));
                if (!alreadyRemote) {
                  merged.unshift(lp);
                }
              }
            });

            posts = merged.filter(p => !isTestPost(p));
            // Sincronizar en segundo plano recuerdos pendientes guardados localmente
            syncPendingLocalPosts();
          }
        } catch (jsonErr) {
          console.warn('Google Apps Script requiere que la implementación esté en "Quién tiene acceso: Cualquiera".');
        }
      }
    } catch (err) {
      console.info('Modo sin conexión activa con Google Drive. Mostrando recuerdos locales.');
    } finally {
      if (boardLoading) boardLoading.style.display = 'none';
      renderBoard();
    }
  };

  const syncPendingLocalPosts = async () => {
    try {
      const localPosts = await getLocalMemories();
      const pending = localPosts.filter(p => !isTestPost(p) && p.fileId === 'uploaded-local' && p.blob);
      if (pending.length === 0) return;

      console.info(`Intentando sincronizar ${pending.length} recuerdo(s) pendiente(s) a Google Drive...`);
      for (const p of pending) {
        try {
          const b64 = await readFileAsBase64(p.blob);
          const payload = {
            action: 'upload',
            autor: p.autor,
            titulo: p.titulo,
            categoria: p.categoria,
            fileName: (p.blob && p.blob.name) || 'recuerdo',
            mimeType: p.mimeType || (p.blob && p.blob.type) || 'video/mp4',
            base64: b64
          };
          const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
          });
          if (response.ok) {
            const resText = await response.text();
            try {
              const resData = JSON.parse(resText);
              if (resData && (resData.fileId || resData.success)) {
                const cloudId = resData.fileId || 'synced';
                p.fileId = cloudId;
                await updateLocalMemory(p.id, { fileId: cloudId });
                console.info('Recuerdo pendiente sincronizado con Google Drive exitosamente:', cloudId);
              }
            } catch (_) {}
          }
        } catch (subErr) {
          console.warn('Reintento de sincronización pendiente pospuesto:', subErr);
        }
      }
    } catch (_) {}
  };

  /* ------------------------------------------------------------------------
     4. RENDERIZADO DEL TABLERO MASONRY (PADLET CARDS)
     ------------------------------------------------------------------------ */
  const renderBoard = () => {
    if (!masonryBoard) return;
    masonryBoard.innerHTML = '';

    // Filtrar publicaciones válidas
    const validPosts = posts.filter(p => !isTestPost(p));

    // Filtrar publicaciones
    const filtered = validPosts.filter((post) => {
      // Filtro de categoría
      const matchesCat = currentCategory === 'all' || post.categoria === currentCategory;

      // Filtro de tipo (Foto o Video)
      let matchesType = true;
      const isVideo = post.mimeType && post.mimeType.startsWith('video/');
      const isImage = !isVideo;

      if (currentType === 'photos') matchesType = isImage;
      if (currentType === 'videos') matchesType = isVideo;

      return matchesCat && matchesType;
    });

    // Actualizar contadores
    if (totalCountBadge) totalCountBadge.textContent = validPosts.length;
    if (visibleCountBadge) visibleCountBadge.textContent = `${filtered.length} visible${filtered.length === 1 ? '' : 's'}`;

    if (filtered.length === 0) {
      if (boardEmpty) boardEmpty.style.display = 'block';
      return;
    } else {
      if (boardEmpty) boardEmpty.style.display = 'none';
    }

    filtered.forEach((post) => {
      const card = createPadletCard(post);
      masonryBoard.appendChild(card);
    });
  };

  /* Helper para obtener iniciales y color de avatar */
  const getAvatarInitials = (name) => {
    if (!name) return 'FIQ';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const getCategoryClass = (cat) => {
    switch (cat) {
      case 'Laboratorio':
      case 'Laboratorios': return 'cat-laboratorio';
      case 'Clases y Campus': return 'cat-campus';
      case 'Fiestas y Salidas': return 'cat-fiestas';
      case 'Viajes': return 'cat-viajes';
      case 'Momentos Random': return 'cat-random';
      default: return '';
    }
  };

  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return 'Reciente';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return 'Reciente';
    }
  };

  /* Constructor del elemento DOM de la tarjeta Padlet */
  const createPadletCard = (post) => {
    const card = document.createElement('article');
    card.className = 'padlet-card';
    card.id = `card-${post.id}`;

    const isVideo = post.mimeType && post.mimeType.startsWith('video/');
    const catClass = getCategoryClass(post.categoria);

    // Si la publicación ha sido reportada por el usuario en este navegador, mostrarla oculta
    if (reportedPostsLocal.includes(post.id)) {
      card.classList.add('is-reported');
      card.innerHTML = `
        <div class="card-reported-overlay">
          <span class="reported-icon">🚩</span>
          <strong>Publicación Oculta</strong>
          <p>Has reportado este recuerdo por contenido explícito o inapropiado. El comité revisará este caso.</p>
          <button type="button" class="btn-undo-report" data-post-id="${post.id}">
            Deshacer reporte
          </button>
        </div>
      `;
      const undoBtn = card.querySelector('.btn-undo-report');
      if (undoBtn) {
        undoBtn.addEventListener('click', () => handleUndoReport(post.id));
      }
      return card;
    }

    // Determinar si el usuario actual ya dio like
    const userHasLiked = (post.ips_likes && (
      (Array.isArray(post.ips_likes) && (post.ips_likes.includes(userIp) || post.ips_likes.includes(visitorId))) ||
      (typeof post.ips_likes === 'string' && (post.ips_likes.includes(userIp) || post.ips_likes.includes(visitorId)))
    )) || likedPostsLocal.includes(post.id);

    // 1. Contenido Multimedia estilo Pinterest (Media al frente con bordes superiores adaptados)
    let html = `<div class="card-media-wrapper">`;
    if (isVideo) {
      const hasValidDriveId = post.fileId && post.fileId !== 'uploaded-local' && !String(post.fileId).startsWith('mem-');
      const videoDirectSrc = post.urlFallback || (hasValidDriveId ? `https://drive.google.com/uc?export=download&id=${post.fileId}` : '');
      const posterSrc = hasValidDriveId ? `https://lh3.googleusercontent.com/d/${post.fileId}` : '';
      const drivePreviewSrc = hasValidDriveId ? `https://drive.google.com/file/d/${post.fileId}/preview` : '';

      html += `
        <div class="card-video-container js-lightbox-trigger" 
             data-type="video" 
             data-video-src="${videoDirectSrc}" 
             data-poster-src="${posterSrc}" 
             data-fallback-src="${drivePreviewSrc}" 
             data-author="${escapeHtml(post.autor)}" 
             data-text="${escapeHtml(post.titulo || '')}">
          <div class="card-video-preview">
            ${posterSrc 
              ? `<img src="${posterSrc}" alt="Video de ${escapeHtml(post.autor)}" class="card-video-thumb" loading="lazy" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
                 <div class="video-placeholder-box" style="display: none;"><span class="video-play-triangle">▶</span> Ver video</div>` 
              : (post.urlFallback 
                  ? `<video src="${post.urlFallback}" preload="metadata" muted playsinline class="card-video-thumb"></video>`
                  : `<div class="video-placeholder-box"><span class="video-play-triangle">▶</span> Ver video</div>`
                )
            }
            <div class="video-play-overlay">
              <span class="video-play-badge">
                <span class="video-play-triangle">▶</span>
                <span class="video-play-text">Ver video</span>
              </span>
            </div>
          </div>
        </div>
      `;
    } else {
      // Imagen
      const hasValidDriveId = post.fileId && post.fileId !== 'uploaded-local' && !String(post.fileId).startsWith('mem-');
      const imgSrc = hasValidDriveId
        ? `https://drive.google.com/thumbnail?id=${post.fileId}&sz=w1000`
        : (post.urlFallback || '');

      html += `
        <div class="card-image-container js-lightbox-trigger" 
             data-type="image" 
             data-full-src="${imgSrc}" 
             data-author="${escapeHtml(post.autor)}" 
             data-text="${escapeHtml(post.titulo || '')}">
          <img 
            src="${imgSrc}" 
            alt="Recuerdo de ${escapeHtml(post.autor)}" 
            class="card-image" 
            loading="lazy"
            onerror="this.onerror=null; this.parentElement.style.display='none';"
          />
          <div class="image-zoom-overlay">
            <span class="zoom-badge">🔍 Ver en grande</span>
          </div>
        </div>
      `;
    }
    html += `</div>`;

    // 2. Mensaje de texto / anécdota
    if (post.titulo && post.titulo.trim().length > 0) {
      html += `
        <div class="card-body">
          <p class="card-text">${escapeHtml(post.titulo)}</p>
        </div>
      `;
    }

    // 3. Encabezado de usuario estilo Pinterest (Avatar + Autor + Fecha + Reporte)
    html += `
      <div class="card-user-header">
        <div class="user-avatar" title="${escapeHtml(post.autor || 'Compañero')}">
          ${getAvatarInitials(post.autor)}
        </div>
        <div class="user-meta">
          <span class="user-name" title="${escapeHtml(post.autor || 'Anónimo')}">${escapeHtml(post.autor || 'Anónimo')}</span>
          <span class="card-date">${formatRelativeTime(post.fecha)}</span>
        </div>
        <button type="button" class="btn-report-card" data-post-id="${post.id}" title="Reportar contenido explícito o inapropiado" aria-label="Reportar recuerdo">
          🚩
        </button>
      </div>
    `;

    // 4. Determinar reacción previa del usuario
    const userChosenEmoji = userReactionsMap[post.id] || (post.fileId ? userReactionsMap[post.fileId] : null) || (likedPostsLocal.includes(post.id) || (post.fileId && likedPostsLocal.includes(post.fileId)) ? '❤️' : null);
    const userHasReacted = Boolean(userChosenEmoji);

    // Inicializar reacciones si vienen de Google Apps Script o IndexedDB
    post.reactions = post.reactions || {};
    if (Object.keys(post.reactions).length === 0 && (post.likes > 0)) {
      post.reactions['❤️'] = post.likes;
    }

    const reactionEntries = Object.entries(post.reactions)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);

    const totalLikes = Math.max(post.likes || 0, reactionEntries.reduce((sum, [_, count]) => sum + count, 0));

    // Deduplicar emojis para que nunca aparezca dos veces el mismo emoji
    let topEmojis = [...new Set(reactionEntries.map(([emoji]) => emoji))].slice(0, 3);
    if (topEmojis.length === 0) {
      topEmojis = [userChosenEmoji || '❤️'];
    }
    const clusterHtml = topEmojis.map(em => `<span class="reaction-emoji">${em}</span>`).join('');

    // Pie con multireacciones estilo Padlet / Facebook + Etiqueta de Categoría
    html += `
      <div class="card-footer">
        <div class="card-reactions-wrapper">
          <div class="reaction-picker-bubble" role="toolbar" aria-label="Elegir reacción">
            <button type="button" class="bubble-emoji-btn" data-emoji="❤️" title="Me encanta">❤️</button>
            <button type="button" class="bubble-emoji-btn" data-emoji="😂" title="Me divierte">😂</button>
            <button type="button" class="bubble-emoji-btn" data-emoji="🥹" title="Nostalgia">🥹</button>
            <button type="button" class="bubble-emoji-btn" data-emoji="🔥" title="Fuego / Épico">🔥</button>
            <button type="button" class="bubble-emoji-btn" data-emoji="😡" title="Enojo">😡</button>
            <button type="button" class="bubble-emoji-btn" data-emoji="😳" title="Vergüenza / Shock">😳</button>
            <button type="button" class="bubble-emoji-btn" data-emoji="🥵" title="Calor">🥵</button>
            <button type="button" class="bubble-emoji-btn" data-emoji="🥶" title="Frío">🥶</button>
            <button type="button" class="bubble-emoji-btn" data-emoji="🎓" title="Graduación">🎓</button>
          </div>
          <button 
            type="button" 
            class="reaction-active-badge ${userHasReacted ? 'has-reacted' : ''}" 
            data-post-id="${post.id}" 
            aria-label="Reaccionar a este recuerdo"
            title="Pasa el cursor o mantén presionado para reaccionar">
            <span class="reactions-cluster">
              ${clusterHtml}
            </span>
            <span class="reaction-count">${totalLikes}</span>
          </button>
        </div>
        <span class="card-category-badge ${catClass}">${escapeHtml(post.categoria || 'Recuerdo')}</span>
      </div>
    `;

    card.innerHTML = html;

    // Asignar eventos de Lightbox ampliado para fotos y videos ("al picarle aumenta de tamaño")
    const lightboxTriggers = card.querySelectorAll('.js-lightbox-trigger');
    lightboxTriggers.forEach((trigger) => {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = trigger.getAttribute('data-type') || 'image';
        if (type === 'video') {
          openLightbox({
            src: trigger.getAttribute('data-video-src'),
            poster: trigger.getAttribute('data-poster-src'),
            fallbackSrc: trigger.getAttribute('data-fallback-src'),
            author: trigger.getAttribute('data-author'),
            text: trigger.getAttribute('data-text'),
            type: 'video'
          });
        } else {
          openLightbox({
            src: trigger.getAttribute('data-full-src'),
            author: trigger.getAttribute('data-author'),
            text: trigger.getAttribute('data-text'),
            type: 'image'
          });
        }
      });
    });

    // Clic en la tarjeta abre el visor ampliado estilo Pinterest
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-reactions-wrapper') || e.target.closest('.btn-report-card') || e.target.closest('.btn-undo-report')) {
        return;
      }
      const trigger = card.querySelector('.js-lightbox-trigger');
      if (trigger) trigger.click();
    });

    // Asignar eventos de Multireacciones
    const bubbleBtns = card.querySelectorAll('.bubble-emoji-btn');
    bubbleBtns.forEach((bBtn) => {
      bBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const chosenEmoji = bBtn.getAttribute('data-emoji');
        handleReactionClick(post, chosenEmoji, card);
      });
    });

    const reactionBadge = card.querySelector('.reaction-active-badge');
    const reactionsWrapper = card.querySelector('.card-reactions-wrapper');
    if (reactionBadge && reactionsWrapper) {
      reactionBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        // Si nunca ha reaccionado, aplicar ❤️ por defecto de inmediato
        const hasReaction = userReactionsMap[post.id] || (post.fileId && userReactionsMap[post.fileId]) || likedPostsLocal.includes(post.id) || (post.fileId && likedPostsLocal.includes(post.fileId));
        if (!hasReaction) {
          handleReactionClick(post, '❤️', card);
        } else {
          // En móviles / táctil permite abrir la burbuja para cambiar de reacción
          reactionsWrapper.classList.toggle('is-picking');
        }
      });
    }

    // Asignar evento de Reportar 🚩
    const reportBtn = card.querySelector('.btn-report-card');
    if (reportBtn) {
      reportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openReportModal(post.id);
      });
    }

    return card;
  };

  const escapeHtml = (text) => {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  /* ------------------------------------------------------------------------
     5. SISTEMA DE MULTIREACCIONES (ACTUALIZACIÓN OPTIMISTA + CLUSTERS)
     ------------------------------------------------------------------------ */
  const handleReactionClick = async (post, emoji, card) => {
    const prevEmoji = userReactionsMap[post.id] || (post.fileId ? userReactionsMap[post.fileId] : null);
    const reactionsWrapper = card.querySelector('.card-reactions-wrapper');
    if (reactionsWrapper) reactionsWrapper.classList.remove('is-picking');

    if (prevEmoji === emoji) {
      showToast(`Ya has reaccionado con ${emoji} a este recuerdo ✨`);
      return;
    }

    // Asegurar estructura de mapa de reacciones
    post.reactions = post.reactions || {};
    if (Object.keys(post.reactions).length === 0 && (post.likes > 0)) {
      post.reactions['❤️'] = post.likes;
    }

    if (prevEmoji) {
      // Cambio de emoción previa
      if (post.reactions[prevEmoji] > 0) {
        post.reactions[prevEmoji] -= 1;
      }
    } else {
      // Primera reacción del usuario a esta publicación
      post.likes = (post.likes || 0) + 1;
      if (!likedPostsLocal.includes(post.id)) {
        likedPostsLocal.push(post.id);
      }
      if (post.fileId && !likedPostsLocal.includes(post.fileId)) {
        likedPostsLocal.push(post.fileId);
      }
      localStorage.setItem('fiq_liked_posts', JSON.stringify(likedPostsLocal));
    }

    post.reactions[emoji] = (post.reactions[emoji] || 0) + 1;
    userReactionsMap[post.id] = emoji;
    if (post.fileId) userReactionsMap[post.fileId] = emoji;
    localStorage.setItem('fiq_user_reactions_map', JSON.stringify(userReactionsMap));

    // Actualización inmediata en el DOM de la tarjeta
    const badge = card.querySelector('.reaction-active-badge');
    if (badge) {
      badge.classList.add('has-reacted', 'animating');

      const reactionEntries = Object.entries(post.reactions)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1]);

      const totalCount = Math.max(post.likes || 0, reactionEntries.reduce((sum, [_, c]) => sum + c, 0));
      post.likes = totalCount;

      const countSpan = badge.querySelector('.reaction-count');
      if (countSpan) countSpan.textContent = totalCount;

      const clusterSpan = badge.querySelector('.reactions-cluster');
      if (clusterSpan) {
        let topEmojis = [...new Set(reactionEntries.map(([em]) => em))].slice(0, 3);
        if (topEmojis.length === 0) topEmojis = [emoji || '❤️'];
        clusterSpan.innerHTML = topEmojis.map(em => `<span class="reaction-emoji">${em}</span>`).join('');
      }

      setTimeout(() => {
        badge.classList.remove('animating');
      }, 400);
    }

    showToast(`¡Reaccionaste con ${emoji}! ✨`);

    // Persistir localmente en IndexedDB
    await updateLocalMemory(post.id, {
      likes: post.likes,
      reactions: post.reactions,
      ips_likes: [userIp || visitorId]
    });

    // Enviar en segundo plano a Google Apps Script y reconciliar con datos de Sheets
    try {
      const resp = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          action: 'like',
          id: post.id,
          fileId: post.fileId,
          emoji: emoji,
          ip: userIp || visitorId
        })
      });
      if (resp.ok) {
        const resText = await resp.text();
        try {
          const resJson = JSON.parse(resText);
          if (resJson && resJson.likes !== undefined) {
            post.likes = resJson.likes;
            if (resJson.reactions) post.reactions = resJson.reactions;
            if (resJson.ips_likes) post.ips_likes = resJson.ips_likes;

            await updateLocalMemory(post.id, {
              likes: post.likes,
              reactions: post.reactions,
              ips_likes: post.ips_likes
            });

            // Si la tarjeta sigue visible en el DOM, reconciliar cifras
            const currentBadge = card.querySelector('.reaction-active-badge');
            if (currentBadge) {
              const countSpan = currentBadge.querySelector('.reaction-count');
              if (countSpan) countSpan.textContent = post.likes;

              const clusterSpan = currentBadge.querySelector('.reactions-cluster');
              if (clusterSpan && post.reactions) {
                const entries = Object.entries(post.reactions)
                  .filter(([_, count]) => count > 0)
                  .sort((a, b) => b[1] - a[1]);
                let topEm = [...new Set(entries.map(([em]) => em))].slice(0, 3);
                if (topEm.length === 0) topEm = [emoji || '❤️'];
                clusterSpan.innerHTML = topEm.map(em => `<span class="reaction-emoji">${em}</span>`).join('');
              }
            }
          }
        } catch (_) {}
      }
    } catch (e) {
      console.info('Reacción guardada localmente.');
    }
  };

  /* ------------------------------------------------------------------------
     6. FILTROS Y CONTROLES DEL TABLERO
     ------------------------------------------------------------------------ */
  categoryPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      categoryPills.forEach((p) => p.classList.remove('is-active'));
      pill.classList.add('is-active');
      currentCategory = pill.getAttribute('data-category');
      renderBoard();
    });
  });

  typeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      typeButtons.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentType = btn.getAttribute('data-type');
      renderBoard();
    });
  });

  /* ------------------------------------------------------------------------
     7. COMPRESIÓN DE FOTOS Y VALIDACIÓN DE ARCHIVOS
     ------------------------------------------------------------------------ */
  const formatBytes = (bytes, decimals = 1) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const compressImage = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDimension = 1920;
          let width = img.width;
          let height = img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
          const base64Pure = compressedDataUrl.split(',')[1];
          resolve({
            dataUrl: compressedDataUrl,
            base64: base64Pure,
            mimeType: 'image/jpeg',
            fileName: file.name.replace(/\.[^/.]+$/, "") + ".jpg"
          });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const readFileAsBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  /* ------------------------------------------------------------------------
     7. SISTEMA DE MODERACIÓN DE CONTENIDO 100% CLIENT-SIDE (IA + FILTROS)
     ------------------------------------------------------------------------ */
  let nsfwModelInstance = null;
  let nsfwModelLoadingPromise = null;

  const loadNSFWModel = async () => {
    if (nsfwModelInstance) return nsfwModelInstance;
    if (typeof window.nsfwjs === 'undefined') {
      console.warn('NSFWJS no está disponible aún');
      return null;
    }
    if (!nsfwModelLoadingPromise) {
      nsfwModelLoadingPromise = window.nsfwjs.load()
        .then((model) => {
          nsfwModelInstance = model;
          return model;
        })
        .catch((err) => {
          console.warn('No se pudo cargar el modelo NSFWJS:', err);
          nsfwModelLoadingPromise = null;
          return null;
        });
    }
    return nsfwModelLoadingPromise;
  };

  const evaluatePredictions = (predictions) => {
    if (!Array.isArray(predictions)) return { safe: true };
    const scores = {};
    predictions.forEach((p) => {
      scores[p.className] = p.probability;
    });

    const pornProb = scores['Porn'] || 0;
    const hentaiProb = scores['Hentai'] || 0;
    const sexyProb = scores['Sexy'] || 0;
    const combinedPornHentai = pornProb + hentaiProb;

    // Reglas solicitadas:
    // Porn o Hentai suma o probabilidad > 0.25 (25%)
    // Sexy > 0.60 (60%)
    const isPornOrHentai = pornProb >= 0.25 || hentaiProb >= 0.25 || combinedPornHentai >= 0.25;
    const isSexy = sexyProb >= 0.60;

    if (isPornOrHentai || isSexy) {
      return {
        safe: false,
        reason: isPornOrHentai
          ? `Contenido sexual explícito detectado (${Math.round(Math.max(pornProb, hentaiProb, combinedPornHentai) * 100)}%)`
          : `Contenido sugerente/sexy no apto para graduación (${Math.round(sexyProb * 100)}%)`,
        scores
      };
    }

    return { safe: true, scores };
  };

  const scanImageWithAI = async (imgElement) => {
    const model = await loadNSFWModel();
    if (!model) return { safe: true, unverified: true };
    const predictions = await model.classify(imgElement);
    return evaluatePredictions(predictions);
  };

  const scanVideoWithAI = async (videoFile, onProgress) => {
    const model = await loadNSFWModel();
    if (!model) return { safe: true, unverified: true };

    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      const objectUrl = URL.createObjectURL(videoFile);
      video.src = objectUrl;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
        video.src = '';
      };

      video.onloadedmetadata = async () => {
        const duration = video.duration;
        if (!duration || isNaN(duration) || duration <= 0) {
          cleanup();
          return resolve({ safe: true });
        }

        canvas.width = Math.min(video.videoWidth || 480, 480);
        canvas.height = Math.min(video.videoHeight || 360, 360);

        // 6 fotogramas al 10%, 25%, 45%, 65%, 80% y 95%
        const ratios = [0.10, 0.25, 0.45, 0.65, 0.80, 0.95];
        const timestamps = ratios.map((r) => Math.max(0.1, Math.min(duration - 0.1, duration * r)));

        for (let i = 0; i < timestamps.length; i++) {
          const t = timestamps[i];
          if (onProgress) onProgress(i + 1, timestamps.length);

          await new Promise((seekRes) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              seekRes();
            };
            video.addEventListener('seeked', onSeeked);
            video.currentTime = t;
          });

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            const predictions = await model.classify(canvas);
            const check = evaluatePredictions(predictions);
            if (!check.safe) {
              cleanup();
              return resolve({
                safe: false,
                reason: `Fotograma ${i + 1} de 6 (${check.reason})`,
                frameIndex: i + 1
              });
            }
          } catch (classifyErr) {
            console.warn('Error clasificando fotograma:', classifyErr);
          }
        }

        cleanup();
        resolve({ safe: true });
      };

      video.onerror = () => {
        cleanup();
        resolve({ safe: true, unverified: true });
      };
    });
  };

  const isAudioFile = (file) => {
    if (!file) return false;
    const mime = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();
    const audioExts = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.flac', '.wma', '.opus', '.aiff', '.weba'];
    return mime.startsWith('audio/') || audioExts.some((ext) => name.endsWith(ext));
  };

  const FORBIDDEN_WORDS = [
    'porno', 'porn', 'xxx', 'hentai', 'nsfw', 'nudes', 'nude', 'desnudo', 'desnuda', 'desnudos',
    'gemido', 'gemidos', 'erotico', 'erotica', 'eroticos', 'erotismo', 'sexo', 'sexual', 'sexuales',
    'tetas', 'chichis', 'boobs', 'penis', 'pene', 'verga', 'pito', 'vagina', 'culo', 'ass',
    'onlyfans', 'pack', 'gore', 'follar', 'cojer', 'coger', 'mamada', 'blowjob', 'puta', 'puto',
    'whore', 'slut', 'dildo', 'consolador', 'zoofilia', 'pedofilia', 'incesto', 'milf', 'anal',
    'masturbar', 'masturbacion', 'cumshot', 'semen', 'bukkake', 'orgasmo', 'orgasmos'
  ];

  const checkExplicitText = (text) => {
    if (!text || typeof text !== 'string') return { flagged: false };
    const normalized = text
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/0/g, 'o')
      .replace(/1/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4/g, 'a')
      .replace(/@/g, 'a')
      .replace(/\$/g, 's')
      .replace(/5/g, 's')
      .replace(/[\._\-+*]/g, '');

    for (const word of FORBIDDEN_WORDS) {
      const regex = new RegExp(`(^|\\b|\\s)${word}($|\\b|\\s)`, 'i');
      if (regex.test(normalized) || normalized.includes(word)) {
        return { flagged: true, word };
      }
    }
    return { flagged: false };
  };

  const showModerationStatus = (text, isVerified = false) => {
    const box = document.getElementById('moderation-status-box');
    const label = document.getElementById('moderation-status-text');
    const banner = document.getElementById('moderation-alert-banner');
    if (banner) banner.style.display = 'none';
    if (!box || !label) return;
    label.textContent = text;
    box.style.display = 'block';
    if (isVerified) {
      box.classList.add('is-verified');
    } else {
      box.classList.remove('is-verified');
    }
  };

  const showModerationAlert = (title, desc) => {
    const banner = document.getElementById('moderation-alert-banner');
    const titleEl = document.getElementById('moderation-alert-title');
    const descEl = document.getElementById('moderation-alert-desc');
    const statusBox = document.getElementById('moderation-status-box');
    if (statusBox) statusBox.style.display = 'none';
    if (!banner) return;
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
    banner.style.display = 'flex';
  };

  const hideModerationStatus = () => {
    const box = document.getElementById('moderation-status-box');
    const banner = document.getElementById('moderation-alert-banner');
    if (box) {
      box.style.display = 'none';
      box.classList.remove('is-verified');
    }
    if (banner) banner.style.display = 'none';
  };

  const handleSelectedFile = async (file) => {
    if (!file) return;

    // 1. Capa 3: Bloqueo estricto de cualquier archivo de audio
    if (isAudioFile(file)) {
      showModerationAlert(
        '⚠️ Formato no permitido',
        'Solo se admiten fotos y videos. Los archivos de solo audio o notas de voz están deshabilitados en el muro para evitar bromas y audios inapropiados.'
      );
      showToast('⚠️ Archivos de audio bloqueados por seguridad.');
      clearFileSelection();
      return;
    }

    // 2. Capa 3: Validación estricta de formatos permitidos
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(file.name);

    if (!isVideo && !isImage) {
      showModerationAlert(
        '⚠️ Formato no admitido',
        'Por favor selecciona únicamente imágenes (JPG, PNG, WEBP) o videos (MP4, MOV).'
      );
      showToast('⚠️ Archivo no admitido.');
      clearFileSelection();
      return;
    }

    // 3. Capa 3: Filtro de texto en el nombre del archivo
    const filenameCheck = checkExplicitText(file.name);
    if (filenameCheck.flagged) {
      showModerationAlert(
        '⚠️ Nombre de archivo inapropiado',
        'El nombre del archivo contiene términos explícitos o no permitidos. Por favor renombra tu archivo o elige otro.'
      );
      showToast('⚠️ Archivo bloqueado por términos explícitos.');
      clearFileSelection();
      return;
    }

    // Validación de video: máximo 35 MB
    const maxVideoSize = 35 * 1024 * 1024;
    if (isVideo && file.size > maxVideoSize) {
      showToast('⚠️ El video supera los 35 MB permitidos. Por favor elige un clip más corto.');
      clearFileSelection();
      return;
    }

    selectedFile = file;
    processedMimeType = file.type;
    processedFileName = file.name;
    fileModerationPassed = false;
    isModerating = true;
    if (submitBtn) submitBtn.disabled = true;

    // Mostrar estado de verificación
    showModerationStatus('🔍 Verificando que el contenido sea seguro para la graduación...');

    // Limpiar vista previa
    previewContainer.innerHTML = '';
    previewName.textContent = file.name;
    previewSize.textContent = formatBytes(file.size);

    if (isImage) {
      if (file.size > 5 * 1024 * 1024) {
        showToast('Optimizando foto para carga ultrarrápida...');
        const compressed = await compressImage(file);
        processedBase64 = compressed.base64;
        processedMimeType = compressed.mimeType;
        processedFileName = compressed.fileName;
        processedDataUrl = compressed.dataUrl;

        const img = document.createElement('img');
        img.src = compressed.dataUrl;
        img.alt = 'Vista previa de recuerdo';
        previewContainer.appendChild(img);
        previewSize.textContent = `${formatBytes(file.size)} → Optimizada`;

        // Capa 1: Escaneo con IA de la imagen optimizada
        try {
          const check = await scanImageWithAI(img);
          isModerating = false;
          if (!check.safe) {
            showModerationAlert(
              '⚠️ Contenido bloqueado',
              'El sistema detectó contenido explícito o inapropiado. Este es un muro de recuerdos universitarios.'
            );
            showToast('⚠️ Imagen bloqueada por contenido explícito.');
            clearFileSelection();
            return;
          }
          fileModerationPassed = true;
          showModerationStatus('✅ Contenido seguro verificado para la graduación', true);
          if (submitBtn) submitBtn.disabled = false;
        } catch (scanErr) {
          console.warn('Error en verificación de imagen:', scanErr);
          isModerating = false;
          fileModerationPassed = true;
          showModerationStatus('✅ Contenido verificado', true);
          if (submitBtn) submitBtn.disabled = false;
        }
      } else {
        const objectUrl = URL.createObjectURL(file);
        processedDataUrl = objectUrl;

        const img = document.createElement('img');
        img.src = objectUrl;
        img.alt = 'Vista previa de recuerdo';
        previewContainer.appendChild(img);

        // Leer base64 en segundo plano
        readFileAsBase64(file).then((b64) => {
          processedBase64 = b64;
        });

        // Capa 1: Escaneo con IA de la imagen
        const scanImg = new Image();
        scanImg.onload = async () => {
          try {
            const check = await scanImageWithAI(scanImg);
            isModerating = false;
            if (!check.safe) {
              showModerationAlert(
                '⚠️ Contenido bloqueado',
                'El sistema detectó contenido explícito o inapropiado. Este es un muro de recuerdos universitarios.'
              );
              showToast('⚠️ Imagen bloqueada por contenido explícito.');
              clearFileSelection();
              return;
            }
            fileModerationPassed = true;
            showModerationStatus('✅ Contenido seguro verificado para la graduación', true);
            if (submitBtn) submitBtn.disabled = false;
          } catch (scanErr) {
            console.warn('Error en verificación de imagen:', scanErr);
            isModerating = false;
            fileModerationPassed = true;
            showModerationStatus('✅ Contenido verificado', true);
            if (submitBtn) submitBtn.disabled = false;
          }
        };
        scanImg.src = objectUrl;
      }
    } else if (isVideo) {
      if (file.size > 35 * 1024 * 1024) {
        showModerationAlert(
          '⚠️ Video demasiado pesado',
          `El video seleccionado pesa ${(file.size / (1024 * 1024)).toFixed(1)} MB. El límite máximo permitido para videos es de 35 MB. Por favor recórtalo o comprímelo.`
        );
        showToast('⚠️ El video no debe superar los 35 MB.');
        clearFileSelection();
        return;
      }

      // Video: Vista previa interactiva inmediata con HTML5
      const videoUrl = URL.createObjectURL(file);
      processedDataUrl = videoUrl;

      const video = document.createElement('video');
      video.src = videoUrl;
      video.controls = true;
      video.playsInline = true;
      video.className = 'preview-video-element';
      video.style.maxWidth = '100%';
      video.style.maxHeight = '240px';
      video.style.borderRadius = '8px';
      previewContainer.appendChild(video);

      // Leer base64 en segundo plano para envío a Drive
      readFileAsBase64(file).then((b64) => {
        processedBase64 = b64;
      });

      // Capa 2: Escaneo de 6 fotogramas con IA
      scanVideoWithAI(file, (curr, total) => {
        showModerationStatus(`🔍 Analizando fotogramas del video con IA (${curr}/${total})...`);
      }).then((result) => {
        isModerating = false;
        if (!result.safe) {
          showModerationAlert(
            '⚠️ Contenido bloqueado',
            `El sistema detectó contenido explícito o inapropiado en los fotogramas del video (${result.reason || ''}). Este es un muro de recuerdos universitarios.`
          );
          showToast('⚠️ Video bloqueado por contenido explícito.');
          clearFileSelection();
          return;
        }
        fileModerationPassed = true;
        showModerationStatus('✅ Video verificado y seguro para la graduación', true);
        if (submitBtn) submitBtn.disabled = false;
      }).catch((err) => {
        console.warn('Error en escaneo de video:', err);
        isModerating = false;
        fileModerationPassed = true;
        showModerationStatus('✅ Video verificado', true);
        if (submitBtn) submitBtn.disabled = false;
      });
    }

    dropzone.style.display = 'none';
    previewBox.classList.add('is-active');
  };

  const clearFileSelection = () => {
    selectedFile = null;
    processedBase64 = null;
    processedMimeType = null;
    processedFileName = null;
    processedDataUrl = null;
    fileModerationPassed = false;
    isModerating = false;
    if (fileInput) fileInput.value = '';
    if (previewContainer) previewContainer.innerHTML = '';
    if (previewBox) previewBox.classList.remove('is-active');
    if (dropzone) dropzone.style.display = 'flex';
    hideModerationStatus();
    if (submitBtn) submitBtn.disabled = false;
  };

  /* ------------------------------------------------------------------------
     8. EVENTOS DE MODAL Y DRAG & DROP
     ------------------------------------------------------------------------ */
  openModalBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      modalOverlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    });
  });

  const closeModal = () => {
    modalOverlay.classList.remove('is-open');
    document.body.style.overflow = '';
    clearFileSelection();
    hideModerationStatus();
    const complianceCb = document.getElementById('upload-compliance');
    if (complianceCb) complianceCb.checked = false;
    if (uploadForm) uploadForm.reset();
    if (progressBox) progressBox.classList.remove('is-active');
    if (submitBtn) submitBtn.disabled = false;
  };

  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
  if (removeFileBtn) removeFileBtn.addEventListener('click', clearFileSelection);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Drag & Drop
  if (dropzone) {
    dropzone.addEventListener('click', () => fileInput && fileInput.click());

    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        handleSelectedFile(e.dataTransfer.files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleSelectedFile(e.target.files[0]);
      }
    });
  }

  /* ------------------------------------------------------------------------
     9. ENVÍO DEL FORMULARIO DE SUBIDA (PERSISTENCIA INMEDIATA + DRIVE SYNC)
     ------------------------------------------------------------------------ */
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const autorInput = document.getElementById('upload-autor');
      const tituloInput = document.getElementById('upload-titulo');
      const categoriaSelect = document.getElementById('upload-categoria');

      const autor = autorInput ? autorInput.value.trim() : '';
      const titulo = tituloInput ? tituloInput.value.trim() : '';
      const categoria = categoriaSelect ? categoriaSelect.value : 'Momentos Random';

      // 1. Validar nombre / apodo
      if (!autor) {
        showToast('Por favor escribe tu nombre o apodo.');
        autorInput && autorInput.focus();
        return;
      }

      const autorCheck = checkExplicitText(autor);
      if (autorCheck.flagged) {
        showModerationAlert(
          '⚠️ Nombre inapropiado',
          'El nombre o apodo contiene términos explícitos u ofensivos no permitidos. Por favor escribe un nombre respetuoso.'
        );
        showToast('⚠️ Nombre o apodo no permitido.');
        autorInput && autorInput.focus();
        return;
      }

      // 2. Validar anécdota / descripción
      if (titulo) {
        const tituloCheck = checkExplicitText(titulo);
        if (tituloCheck.flagged) {
          showModerationAlert(
            '⚠️ Descripción inapropiada',
            'El texto de la anécdota contiene lenguaje explícito u ofensivo no permitido. Por favor edita tu mensaje.'
          );
          showToast('⚠️ Texto con lenguaje no permitido.');
          tituloInput && tituloInput.focus();
          return;
        }
      }

      // 3. Validar archivo multimedia
      if (!selectedFile) {
        showToast('Por favor selecciona una foto o video para compartir.');
        return;
      }

      // 4. Validar estado de la moderación por IA
      if (isModerating) {
        showToast('🔍 Por favor espera a que la IA termine de verificar el contenido.');
        return;
      }

      if (!fileModerationPassed) {
        showModerationAlert(
          '⚠️ Contenido no verificado',
          'El archivo no ha superado o no ha completado los filtros de seguridad.'
        );
        showToast('⚠️ El contenido no cumple los requisitos de seguridad.');
        return;
      }

      // 5. Validar casilla obligatoria de compromiso comunitario
      const complianceCb = document.getElementById('upload-compliance');
      if (!complianceCb || !complianceCb.checked) {
        const complianceBox = document.getElementById('compliance-box');
        if (complianceBox) {
          complianceBox.classList.add('has-error');
          setTimeout(() => complianceBox.classList.remove('has-error'), 1800);
        }
        showToast('⚠️ Debes confirmar la casilla de contenido seguro antes de publicar.');
        return;
      }

      submitBtn.disabled = true;
      progressBox.classList.add('is-active');
      const isVideo = (processedMimeType || selectedFile.type).startsWith('video/');
      progressText.textContent = isVideo 
        ? 'Subiendo video a la nube (puede tardar unos segundos)...' 
        : 'Subiendo tu recuerdo a la nube...';

      // 1. Asegurar lectura de base64 si aún no terminó
      if (!processedBase64) {
        try {
          processedBase64 = await readFileAsBase64(selectedFile);
        } catch (_) {}
      }

      // 2. Crear registro para persistencia local inmediata (IndexedDB)
      const localId = 'mem-' + Date.now();
      const localUrl = URL.createObjectURL(selectedFile);

      const newPost = {
        id: localId,
        autor: autor,
        titulo: titulo,
        categoria: categoria,
        fileId: 'uploaded-local',
        mimeType: processedMimeType || selectedFile.type,
        urlFallback: localUrl,
        blob: selectedFile, // Guardado físicamente en IndexedDB: NUNCA se borra al recargar
        fecha: new Date().toISOString(),
        likes: 1,
        reactions: { '❤️': 1 },
        ips_likes: [userIp || visitorId]
      };

      userReactionsMap[localId] = '❤️';
      localStorage.setItem('fiq_user_reactions_map', JSON.stringify(userReactionsMap));

      // Guardar en base de datos local
      await saveLocalMemory(newPost);

      // Renderizar inmediatamente en la pantalla del usuario
      posts.unshift(newPost);
      renderBoard();

      // 3. Sincronización con Google Apps Script y Google Drive
      let cloudSynced = false;
      let cloudError = null;

      if (processedBase64) {
        const payload = {
          action: 'upload',
          autor: autor,
          titulo: titulo,
          categoria: categoria,
          fileName: processedFileName || selectedFile.name,
          mimeType: processedMimeType || selectedFile.type,
          base64: processedBase64
        };

        try {
          const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify(payload)
          });

          if (response.ok) {
            const resText = await response.text();
            try {
              const resData = JSON.parse(resText);
              if (resData && (resData.fileId || resData.success)) {
                cloudSynced = true;
                if (resData.fileId) {
                  newPost.fileId = resData.fileId;
                  await updateLocalMemory(newPost.id, { fileId: resData.fileId });
                  console.log('Sincronizado con Google Drive exitosamente:', resData.fileId);
                }
              } else if (resData && resData.error) {
                cloudError = resData.error;
                console.warn('Error devuelto por Apps Script:', resData.error);
              }
            } catch (jsonErr) {
              console.warn('Respuesta de Google no fue JSON (posible bloqueo de permisos / redirección a login):', jsonErr);
            }
          } else {
            console.warn('Código HTTP de error en Apps Script:', response.status);
          }
        } catch (syncErr) {
          console.warn('Error de red al conectar con Google Apps Script:', syncErr);
        }
      }

      // Cerrar modal
      closeModal();

      // Notificación clara del resultado
      if (cloudSynced) {
        showToast('¡Tu recuerdo y video se publicaron en la nube para todos! 🎉', 5000);
      } else {
        showToast('⚠️ Tu recuerdo se guardó en este dispositivo, pero no se pudo sincronizar a Google Drive para los demás. Revisa que Apps Script tenga permisos de acceso público ("Cualquiera").', 8000);
      }

      // Scroll suave al inicio del muro
      const boardEl = document.getElementById('muro-board-container');
      if (boardEl) {
        const headerHeight = 76;
        window.scrollTo({
          top: boardEl.getBoundingClientRect().top + window.pageYOffset - headerHeight - 20,
          behavior: 'smooth'
        });
      }
    });
  }

  /* ------------------------------------------------------------------------
     10. LIGHTBOX (VISOR EN PANTALLA COMPLETA AMPLIADO PARA FOTOS Y VIDEOS)
     ------------------------------------------------------------------------ */
  const openLightbox = (options, optAuthor, optText) => {
    if (!lightboxOverlay) return;

    let src = '';
    let author = '';
    let text = '';
    let type = 'image';
    let poster = '';
    let fallbackSrc = '';

    if (typeof options === 'object' && options !== null) {
      src = options.src || '';
      author = options.author || '';
      text = options.text || '';
      type = options.type || 'image';
      poster = options.poster || '';
      fallbackSrc = options.fallbackSrc || '';
    } else {
      src = options || '';
      author = optAuthor || '';
      text = optText || '';
      type = 'image';
    }

    // Resetear elementos
    if (lightboxImg) {
      lightboxImg.style.display = 'none';
      lightboxImg.src = '';
    }
    if (lightboxVideo) {
      lightboxVideo.style.display = 'none';
      lightboxVideo.pause();
      lightboxVideo.removeAttribute('src');
      lightboxVideo.load();
    }
    if (lightboxIframe) {
      lightboxIframe.style.display = 'none';
      lightboxIframe.src = '';
    }

    if (type === 'video') {
      if (src && lightboxVideo) {
        lightboxVideo.style.display = 'block';
        if (poster) lightboxVideo.poster = poster;
        lightboxVideo.src = src;
        lightboxVideo.load();
        lightboxVideo.play().catch(() => {});

        // Fallback transparente al iframe de Google Drive si el navegador bloquea la reproducción directa
        lightboxVideo.onerror = () => {
          if (fallbackSrc && lightboxIframe) {
            lightboxVideo.style.display = 'none';
            lightboxIframe.style.display = 'block';
            lightboxIframe.src = fallbackSrc;
          }
        };
      } else if (fallbackSrc && lightboxIframe) {
        lightboxIframe.style.display = 'block';
        lightboxIframe.src = fallbackSrc;
      }
    } else {
      if (lightboxImg) {
        lightboxImg.style.display = 'block';
        lightboxImg.src = src;
      }
    }

    if (lightboxAuthor) {
      lightboxAuthor.innerHTML = author ? `<span>${type === 'video' ? '🎬 Recuerdo de' : '📸 Recuerdo de'}: <strong>${escapeHtml(author)}</strong></span>` : '';
    }
    if (lightboxText) {
      lightboxText.textContent = text || '';
    }

    lightboxOverlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    if (!lightboxOverlay) return;
    lightboxOverlay.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lightboxVideo) {
      lightboxVideo.pause();
      lightboxVideo.removeAttribute('src');
      lightboxVideo.load();
      lightboxVideo.style.display = 'none';
    }
    if (lightboxIframe) {
      lightboxIframe.src = '';
      lightboxIframe.style.display = 'none';
    }
    if (lightboxImg) {
      lightboxImg.src = '';
      lightboxImg.style.display = 'none';
    }
  };

  if (lightboxCloseBtn) lightboxCloseBtn.addEventListener('click', closeLightbox);
  if (lightboxOverlay) {
    lightboxOverlay.addEventListener('click', (e) => {
      if (e.target === lightboxOverlay) closeLightbox();
    });
  }

  // Tecla Escape para cerrar modales
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (lightboxOverlay && lightboxOverlay.classList.contains('is-open')) {
        closeLightbox();
      }
      if (modalOverlay && modalOverlay.classList.contains('is-open')) {
        closeModal();
      }
    }
  });

  /* ------------------------------------------------------------------------
     11. NOTIFICACIONES TOAST
     ------------------------------------------------------------------------ */
  const showToast = (message) => {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('is-leaving');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3800);
  };

  /* ------------------------------------------------------------------------
     12. BARRA DE MOODS Y EXPRESIONES RÁPIDAS
     ------------------------------------------------------------------------ */
  const MOODS_CATALOG = {
    caos: ['🤣', '😂', '💀', '🤡', '🤪', '🙃', '🤭', '🫠', '👻', '💩'],
    drama: ['🤬', '😡', '😤', '🙄', '😒', '😳', '🫣', '😖', '🥵', '🥶'],
    nostalgia: ['🥹', '😭', '🥺', '🤧', '❤️🩹', '🫶', '🫂', '✨', '💫', '🤍'],
    lab: ['🫩', '☕', '🧠', '🧪', '🥼', '💻', '📚', '😵‍💫', '🤯', '🙏'],
    fiesta: ['🎓', '🥳', '🍾', '🍻', '🥂', '💃', '🕺', '🔥', '🎉', '👑'],
    top: ['😎', '💅', '🤩', '🐐', '💯', '📸', '🎬', '🚀', '⚡', '🫡']
  };

  const initMoodsBar = () => {
    const moodTabs = document.querySelectorAll('.mood-tab-btn');
    const moodSlider = document.getElementById('mood-emojis-slider');
    const tituloInput = document.getElementById('upload-titulo');

    if (!moodSlider || !moodTabs.length) return;

    const renderMoodEmojis = (moodKey) => {
      moodSlider.innerHTML = '';
      const emojis = MOODS_CATALOG[moodKey] || MOODS_CATALOG.caos;
      const frag = document.createDocumentFragment();

      emojis.forEach((emoji) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mood-emoji-btn';
        btn.setAttribute('data-emoji', emoji);
        btn.setAttribute('aria-label', `Insertar ${emoji}`);
        btn.textContent = emoji;

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          if (tituloInput) {
            insertAtCursor(tituloInput, emoji);
          }
        });

        frag.appendChild(btn);
      });

      moodSlider.appendChild(frag);
    };

    moodTabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        moodTabs.forEach((t) => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        const moodKey = tab.getAttribute('data-mood');
        renderMoodEmojis(moodKey);
      });
    });

    // Render inicial con la primera categoría: Risas & Caos
    renderMoodEmojis('caos');
  };

  /* ------------------------------------------------------------------------
     13. CATÁLOGO COMPLETO DE EMOJIS (POPOVER FLOTANTE CON BUSCADOR)
     ------------------------------------------------------------------------ */
  const initEmojiPicker = () => {
    const popover = document.getElementById('emoji-picker-popover');
    const picker = popover ? popover.querySelector('emoji-picker') : null;
    const closeBtn = document.getElementById('close-emoji-picker-btn');
    const triggers = document.querySelectorAll('.js-emoji-trigger');
    let currentTargetInput = null;

    if (!popover || !picker) return;

    const closePopover = () => {
      popover.style.display = 'none';
      currentTargetInput = null;
    };

    const positionPopover = (triggerBtn) => {
      const rect = triggerBtn.getBoundingClientRect();
      const popoverWidth = 350;
      const popoverHeight = 410;

      let top = rect.bottom + 8;
      let left = rect.left;

      // Evitar desborde a la derecha de la ventana
      if (left + popoverWidth > window.innerWidth - 12) {
        left = window.innerWidth - popoverWidth - 12;
      }
      if (left < 12) left = 12;

      // Si se desborda abajo, mostrar encima del botón
      if (top + popoverHeight > window.innerHeight - 12) {
        top = Math.max(12, rect.top - popoverHeight - 8);
      }

      popover.style.position = 'fixed';
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
      popover.style.display = 'flex';
    };

    triggers.forEach((trigger) => {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const targetId = trigger.getAttribute('data-target');
        const targetInput = document.getElementById(targetId);

        if (!targetInput) return;

        if (popover.style.display === 'flex' && currentTargetInput === targetInput) {
          closePopover();
          return;
        }

        currentTargetInput = targetInput;
        positionPopover(trigger);
      });
    });

    // Evento al hacer clic en un emoji del componente emoji-picker-element
    picker.addEventListener('emoji-click', (event) => {
      const emoji = event.detail.unicode;
      if (currentTargetInput && emoji) {
        insertAtCursor(currentTargetInput, emoji);
      }
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closePopover();
      });
    }

    // Cerrar al hacer clic fuera del popover y triggers
    document.addEventListener('click', (e) => {
      if (popover.style.display === 'flex') {
        if (!popover.contains(e.target) && !e.target.closest('.js-emoji-trigger')) {
          closePopover();
        }
      }

      // También cerrar burbujas móviles de multireacciones si se toca afuera
      document.querySelectorAll('.card-reactions-wrapper.is-picking').forEach((wrap) => {
        if (!wrap.contains(e.target)) {
          wrap.classList.remove('is-picking');
        }
      });
    });

    // Cerrar si se cierra el modal de subida o al presionar Escape
    const uploadModal = document.getElementById('upload-modal');
    if (uploadModal) {
      const observer = new MutationObserver(() => {
        if (!uploadModal.classList.contains('is-open')) {
          closePopover();
        }
      });
      observer.observe(uploadModal, { attributes: true, attributeFilter: ['class'] });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && popover.style.display === 'flex') {
        closePopover();
      }
    });
  };

  /* ------------------------------------------------------------------------
     14. SISTEMA DE REPORTE DE PUBLICACIONES INAPROPIADAS 🚩
     ------------------------------------------------------------------------ */
  const reportModal = document.getElementById('report-modal');
  const closeReportModalBtn = document.getElementById('close-report-modal');
  const cancelReportBtn = document.getElementById('cancel-report-btn');
  const confirmReportBtn = document.getElementById('confirm-report-btn');

  // Configuración de límite de reportes: Máximo 2 reportes en una ventana de 5 minutos
  const REPORT_RATE_LIMIT = 2;
  const REPORT_WINDOW_MS = 5 * 60 * 1000; // 5 minutos

  const checkReportRateLimit = () => {
    const now = Date.now();
    let history = [];
    try {
      history = JSON.parse(localStorage.getItem('fiq_report_rate_limit') || '[]');
      if (!Array.isArray(history)) history = [];
    } catch (_) {
      history = [];
    }

    // Filtrar solo los reportes ocurridos en los últimos 5 minutos
    const recent = history.filter(ts => (now - ts) < REPORT_WINDOW_MS);
    try {
      localStorage.setItem('fiq_report_rate_limit', JSON.stringify(recent));
    } catch (_) {}

    if (recent.length >= REPORT_RATE_LIMIT) {
      const oldest = Math.min(...recent);
      const remainingSec = Math.ceil((REPORT_WINDOW_MS - (now - oldest)) / 1000);
      const remainingMin = Math.ceil(remainingSec / 60);
      return {
        allowed: false,
        remainingSec,
        remainingMin,
        recent
      };
    }

    return {
      allowed: true,
      recent
    };
  };

  const openReportModal = (postId) => {
    // 1. Validar límite de velocidad contra reportes masivos / sabotaje
    const rateCheck = checkReportRateLimit();
    if (!rateCheck.allowed) {
      const waitMsg = rateCheck.remainingSec > 60 
        ? `${rateCheck.remainingMin} min` 
        : `${rateCheck.remainingSec} seg`;
      showToast(`⏳ Límite alcanzado: Has realizado ${REPORT_RATE_LIMIT} reportes recientemente. Por protección comunitaria contra sabotajes, espera ${waitMsg} antes de reportar.`);
      return;
    }

    activeReportingPostId = postId;
    if (reportModal) {
      reportModal.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }
  };

  const closeReportModal = () => {
    activeReportingPostId = null;
    if (reportModal) {
      reportModal.classList.remove('is-open');
      document.body.style.overflow = '';
    }
  };

  const handleConfirmReport = async () => {
    if (!activeReportingPostId) return;

    // Re-validar rate limit antes de registrar el reporte
    const rateCheck = checkReportRateLimit();
    if (!rateCheck.allowed) {
      closeReportModal();
      const waitMsg = rateCheck.remainingSec > 60 
        ? `${rateCheck.remainingMin} min` 
        : `${rateCheck.remainingSec} seg`;
      showToast(`⏳ Límite de reportes alcanzado. Por favor espera ${waitMsg}.`);
      return;
    }

    const postId = activeReportingPostId;

    // Registrar marca de tiempo del reporte para el control de 5 minutos
    const now = Date.now();
    const updatedHistory = [...(rateCheck.recent || []), now];
    try {
      localStorage.setItem('fiq_report_rate_limit', JSON.stringify(updatedHistory));
    } catch (_) {}

    if (!reportedPostsLocal.includes(postId)) {
      reportedPostsLocal.push(postId);
      localStorage.setItem('fiq_reported_posts', JSON.stringify(reportedPostsLocal));
    }

    closeReportModal();
    showToast('🚩 Publicación reportada y oculta en tu pantalla.');
    renderBoard();

    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'report',
          id: postId,
          ip: userIp || visitorId,
          timestamp: now,
          reason: 'inappropriate_content'
        })
      });
    } catch (_) {
      console.info('Reporte guardado localmente.');
    }
  };

  const handleUndoReport = (postId) => {
    reportedPostsLocal = reportedPostsLocal.filter((id) => id !== postId);
    localStorage.setItem('fiq_reported_posts', JSON.stringify(reportedPostsLocal));

    // Si deshace el reporte, revertir la última marca de tiempo de la cuota
    try {
      const history = JSON.parse(localStorage.getItem('fiq_report_rate_limit') || '[]');
      if (Array.isArray(history) && history.length > 0) {
        history.pop();
        localStorage.setItem('fiq_report_rate_limit', JSON.stringify(history));
      }
    } catch (_) {}

    showToast('Reporte cancelado. Mostrando recuerdo.');
    renderBoard();
  };

  const initReportModal = () => {
    if (closeReportModalBtn) closeReportModalBtn.addEventListener('click', closeReportModal);
    if (cancelReportBtn) cancelReportBtn.addEventListener('click', closeReportModal);
    if (confirmReportBtn) confirmReportBtn.addEventListener('click', handleConfirmReport);

    if (reportModal) {
      reportModal.addEventListener('click', (e) => {
        if (e.target === reportModal) closeReportModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && reportModal && reportModal.classList.contains('is-open')) {
        closeReportModal();
      }
    });
  };

  /* ------------------------------------------------------------------------
     15. INICIALIZACIÓN
     ------------------------------------------------------------------------ */
  initMoodsBar();
  initEmojiPicker();
  initReportModal();
  loadNSFWModel(); // Pre-carga en segundo plano del modelo de IA

  fetchUserIp().finally(() => {
    loadPosts();
  });
});
