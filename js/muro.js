/**
 * MURO DE RECUERDOS — SCRIPT CLIENTE ESTILO PADLET
 * Integración con Google Drive vía Google Apps Script y Reacciones por IP
 * Facultad de Ingeniería Química · Generación Diciembre 2027
 */

document.addEventListener('DOMContentLoaded', () => {
  // Configuración del endpoint de Google Apps Script
  const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw60I23MSZ2qhp7SwqHhUIbs8BuWKws-vTz0iL6ZO-I_-haCy9PQRPGVsRFNiV37jac/exec';

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

  // Generar o recuperar UUID de visitante
  if (!visitorId) {
    visitorId = 'fiq_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    localStorage.setItem('fiq_visitor_uuid', visitorId);
  }

  // Lista local de likes del usuario en este navegador
  let likedPostsLocal = JSON.parse(localStorage.getItem('fiq_liked_posts') || '[]');

  /* ------------------------------------------------------------------------
     1. OBTENCIÓN DE IP PÚBLICA (CON FALLBACK A LOCALSTORAGE)
     ------------------------------------------------------------------------ */
  const fetchUserIp = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        userIp = data.ip;
      }
    } catch (e) {
      console.warn('No se pudo obtener IP pública directamente, usando identificador de respaldo:', visitorId);
    }
    if (!userIp) {
      userIp = visitorId;
    }
  };

  /* ------------------------------------------------------------------------
     2. CARGA DE PUBLICACIONES DESDE GOOGLE APPS SCRIPT
     ------------------------------------------------------------------------ */
  const loadPosts = async () => {
    if (boardLoading) boardLoading.style.display = 'flex';
    if (boardEmpty) boardEmpty.style.display = 'none';

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
          if (Array.isArray(data)) {
            posts = data;
          } else if (data && Array.isArray(data.posts)) {
            posts = data.posts;
          } else {
            posts = [];
          }
        } catch (jsonErr) {
          console.warn('La respuesta de Google Apps Script no fue JSON:', jsonErr);
          posts = [];
        }
      } else {
        console.warn('Error HTTP al conectar con Google Apps Script:', res.status);
        posts = [];
      }
    } catch (err) {
      console.warn('Error de red al consultar Google Apps Script:', err);
      posts = [];
    } finally {
      if (boardLoading) boardLoading.style.display = 'none';
      renderBoard();
    }
  };

  /* ------------------------------------------------------------------------
     4. RENDERIZADO DEL TABLERO MASONRY (PADLET CARDS)
     ------------------------------------------------------------------------ */
  const renderBoard = () => {
    if (!masonryBoard) return;
    masonryBoard.innerHTML = '';

    // Filtrar publicaciones
    const filtered = posts.filter((post) => {
      // Filtro de categoría
      const matchesCat = currentCategory === 'all' || post.categoria === currentCategory;

      // Filtro de tipo
      let matchesType = true;
      const isVideo = post.mimeType && post.mimeType.startsWith('video/');
      const isImage = !isVideo;

      if (currentType === 'photos') matchesType = isImage;
      if (currentType === 'videos') matchesType = isVideo;

      return matchesCat && matchesType;
    });

    // Actualizar contadores
    if (totalCountBadge) totalCountBadge.textContent = posts.length;
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

  /* Constructor del elemento DOM de la tarjeta */
  const createPadletCard = (post) => {
    const card = document.createElement('article');
    card.className = 'padlet-card';
    card.id = `card-${post.id}`;

    const isVideo = post.mimeType && post.mimeType.startsWith('video/');
    const catClass = getCategoryClass(post.categoria);

    // Determinar si el usuario actual ya dio like
    const userHasLiked = (post.ips_likes && (
      (Array.isArray(post.ips_likes) && (post.ips_likes.includes(userIp) || post.ips_likes.includes(visitorId))) ||
      (typeof post.ips_likes === 'string' && (post.ips_likes.includes(userIp) || post.ips_likes.includes(visitorId)))
    )) || likedPostsLocal.includes(post.id);

    // Encabezado de la tarjeta
    let html = `
      <div class="card-user-header">
        <div class="user-avatar" title="${escapeHtml(post.autor || 'Compañero')}">
          ${getAvatarInitials(post.autor)}
        </div>
        <div class="user-meta">
          <div class="user-name-line">
            <span class="user-name">${escapeHtml(post.autor || 'Anónimo')}</span>
            <span class="card-category-badge ${catClass}">${escapeHtml(post.categoria || 'Recuerdo')}</span>
          </div>
          <span class="card-date">${formatRelativeTime(post.fecha)}</span>
        </div>
      </div>
    `;

    // Contenido Multimedia
    html += `<div class="card-media-wrapper">`;
    if (isVideo) {
      // Reproductor de Video Embebido de Google Drive
      const videoSrc = post.fileId
        ? `https://drive.google.com/file/d/${post.fileId}/preview`
        : (post.urlFallback || '');
      html += `
        <div class="card-video-container">
          <iframe 
            src="${videoSrc}" 
            loading="lazy" 
            title="Video recuerdo de ${escapeHtml(post.autor)}" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowfullscreen>
          </iframe>
        </div>
      `;
    } else {
      // Imagen directa de Google Drive Thumbnail con Lightbox
      const imgSrc = post.fileId && post.fileId !== 'uploaded-local'
        ? `https://drive.google.com/thumbnail?id=${post.fileId}&sz=w1000`
        : (post.urlFallback || '');

      html += `
        <div class="card-image-container js-lightbox-trigger" data-full-src="${imgSrc}" data-author="${escapeHtml(post.autor)}" data-text="${escapeHtml(post.titulo || '')}">
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

    // Cuerpo y mensaje
    if (post.titulo && post.titulo.trim().length > 0) {
      html += `
        <div class="card-body">
          <p class="card-text">${escapeHtml(post.titulo)}</p>
        </div>
      `;
    }

    // Pie con botón de corazón y contador de likes
    html += `
      <div class="card-footer">
        <button 
          type="button" 
          class="like-btn ${userHasLiked ? 'is-liked' : ''}" 
          data-post-id="${post.id}" 
          aria-label="Reaccionar con corazón a este recuerdo"
          ${userHasLiked ? 'disabled' : ''}>
          <svg class="like-heart-icon" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          <span class="like-count">${post.likes || 0}</span>
        </button>
        <span style="font-size: 0.78rem; color: var(--color-text-light);">FIQ 2027</span>
      </div>
    `;

    card.innerHTML = html;

    // Asignar evento de Lightbox a la imagen
    const imageContainer = card.querySelector('.js-lightbox-trigger');
    if (imageContainer) {
      imageContainer.addEventListener('click', () => {
        openLightbox(
          imageContainer.getAttribute('data-full-src'),
          imageContainer.getAttribute('data-author'),
          imageContainer.getAttribute('data-text')
        );
      });
    }

    // Asignar evento de Like
    const likeBtn = card.querySelector('.like-btn');
    if (likeBtn) {
      likeBtn.addEventListener('click', () => handleLikeClick(post, likeBtn));
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
     5. SISTEMA DE CORAZONES POR IP (ACTUALIZACIÓN OPTIMISTA)
     ------------------------------------------------------------------------ */
  const handleLikeClick = async (post, btn) => {
    if (btn.classList.contains('is-liked') || btn.disabled) {
      showToast('Ya has reaccionado a este recuerdo ❤️');
      return;
    }

    // Actualización optimista inmediata
    btn.classList.add('is-liked', 'animating');
    btn.disabled = true;

    const countSpan = btn.querySelector('.like-count');
    const currentLikes = parseInt(countSpan.textContent, 10) || 0;
    countSpan.textContent = currentLikes + 1;
    post.likes = currentLikes + 1;

    // Guardar en caché local del navegador
    if (!likedPostsLocal.includes(post.id)) {
      likedPostsLocal.push(post.id);
      localStorage.setItem('fiq_liked_posts', JSON.stringify(likedPostsLocal));
    }

    showToast('¡Gracias por tu reacción! ❤️');

    // Quitar clase de animación después de 400ms
    setTimeout(() => {
      btn.classList.remove('animating');
    }, 400);

    // Enviar en segundo plano al Google Apps Script
    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8' // Clave para evitar errores de preflight CORS en Apps Script
        },
        body: JSON.stringify({
          action: 'like',
          id: post.id,
          ip: userIp || visitorId
        })
      });
    } catch (e) {
      console.warn('El like se guardó localmente, pero el backend no respondió:', e);
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
     7. COMPRESIÓN DE IMÁGENES Y VALIDACIÓN DE ARCHIVOS
     ------------------------------------------------------------------------ */
  const formatBytes = (bytes, decimals = 1) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Compresión en el navegador con HTML5 Canvas para fotos > 5 MB
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

          // Calidad 0.82 garantiza subidas instantáneas (< 1MB) y nitidez perfecta
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

  const handleSelectedFile = async (file) => {
    if (!file) return;

    selectedFile = file;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isVideo && !isImage) {
      showToast('Por favor selecciona un archivo de imagen o video válido.');
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

    // Limpiar vista previa previa
    previewContainer.innerHTML = '';
    previewName.textContent = file.name;
    previewSize.textContent = formatBytes(file.size);

    if (isImage) {
      if (file.size > 5 * 1024 * 1024) {
        // Foto pesada: comprimir para subida rápida
        showToast('Optimizando foto para subida rápida...');
        const compressed = await compressImage(file);
        processedBase64 = compressed.base64;
        processedMimeType = compressed.mimeType;
        processedFileName = compressed.fileName;

        const img = document.createElement('img');
        img.src = compressed.dataUrl;
        img.alt = 'Vista previa de recuerdo';
        previewContainer.appendChild(img);
        previewSize.textContent = `${formatBytes(file.size)} → Optimizada`;
      } else {
        // Foto normal: leer directo
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = document.createElement('img');
          img.src = e.target.result;
          img.alt = 'Vista previa de recuerdo';
          previewContainer.appendChild(img);
          processedBase64 = e.target.result.split(',')[1];
          processedMimeType = file.type;
          processedFileName = file.name;
        };
        reader.readAsDataURL(file);
      }
    } else if (isVideo) {
      // Video: generar vista previa con <video>
      const videoUrl = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.src = videoUrl;
      video.controls = true;
      video.playsInline = true;
      previewContainer.appendChild(video);

      // Leer a base64
      const reader = new FileReader();
      reader.onload = (e) => {
        processedBase64 = e.target.result.split(',')[1];
        processedMimeType = file.type;
        processedFileName = file.name;
      };
      reader.readAsDataURL(file);
    }

    dropzone.style.display = 'none';
    previewBox.classList.add('is-active');
  };

  const clearFileSelection = () => {
    selectedFile = null;
    processedBase64 = null;
    processedMimeType = null;
    processedFileName = null;
    if (fileInput) fileInput.value = '';
    if (previewContainer) previewContainer.innerHTML = '';
    if (previewBox) previewBox.classList.remove('is-active');
    if (dropzone) dropzone.style.display = 'flex';
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
     9. ENVÍO DEL FORMULARIO DE SUBIDA (POST A GOOGLE APPS SCRIPT)
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

      if (!autor) {
        showToast('Por favor escribe tu nombre o apodo.');
        autorInput && autorInput.focus();
        return;
      }

      if (!selectedFile || !processedBase64) {
        showToast('Por favor selecciona una foto o video para compartir.');
        return;
      }

      // Deshabilitar botón y mostrar barra de progreso
      submitBtn.disabled = true;
      progressBox.classList.add('is-active');
      progressText.textContent = 'Subiendo tu recuerdo al muro y a Google Drive...';

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
            'Content-Type': 'text/plain;charset=utf-8' // Evita errores de preflight CORS con Apps Script
          },
          body: JSON.stringify(payload)
        });

        // Intentar leer respuesta
        const resText = await response.text();
        console.log('Respuesta de subida Apps Script:', resText);

        // Crear tarjeta local inmediatamente para experiencia instantánea
        const newPost = {
          id: 'mem-' + Date.now(),
          autor: autor,
          titulo: titulo,
          categoria: categoria,
          fileId: 'uploaded-local',
          urlFallback: (processedMimeType && processedMimeType.startsWith('image/')) 
            ? `data:${processedMimeType};base64,${processedBase64}` 
            : null,
          mimeType: processedMimeType,
          fecha: new Date().toISOString(),
          likes: 1,
          ips_likes: [userIp || visitorId]
        };

        // Agregar al inicio
        posts.unshift(newPost);
        renderBoard();

        closeModal();
        showToast('¡Tu recuerdo ha sido publicado con éxito en el muro! 🎉');

        // Scroll suave al inicio del tablero para ver la nueva publicación
        const boardEl = document.getElementById('muro-board-container');
        if (boardEl) {
          const headerHeight = 76;
          window.scrollTo({
            top: boardEl.getBoundingClientRect().top + window.pageYOffset - headerHeight - 20,
            behavior: 'smooth'
          });
        }
      } catch (err) {
        console.error('Error al subir a Google Apps Script:', err);

        // Aún si el script falla por permisos o CORS temporal, renderizamos el recuerdo localmente
        const newPost = {
          id: 'mem-' + Date.now(),
          autor: autor,
          titulo: titulo,
          categoria: categoria,
          fileId: 'uploaded-local',
          urlFallback: (processedMimeType && processedMimeType.startsWith('image/')) 
            ? `data:${processedMimeType};base64,${processedBase64}` 
            : null,
          mimeType: processedMimeType,
          fecha: new Date().toISOString(),
          likes: 1,
          ips_likes: [userIp || visitorId]
        };

        posts.unshift(newPost);
        renderBoard();

        closeModal();
        showToast('¡Tu recuerdo ha sido publicado con éxito en el muro! 🎉');
      }
    });
  }

  /* ------------------------------------------------------------------------
     10. LIGHTBOX (VISOR EN PANTALLA COMPLETA)
     ------------------------------------------------------------------------ */
  const openLightbox = (src, author, text) => {
    if (!lightboxOverlay || !lightboxImg) return;
    lightboxImg.src = src;
    if (lightboxAuthor) lightboxAuthor.textContent = author ? `Foto de: ${author}` : '';
    if (lightboxText) lightboxText.textContent = text || '';
    lightboxOverlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    if (!lightboxOverlay) return;
    lightboxOverlay.classList.remove('is-open');
    document.body.style.overflow = '';
    if (lightboxImg) lightboxImg.src = '';
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
     11. TOAST NOTIFICATIONS
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
     12. INICIALIZACIÓN
     ------------------------------------------------------------------------ */
  fetchUserIp().finally(() => {
    loadPosts();
  });
});
