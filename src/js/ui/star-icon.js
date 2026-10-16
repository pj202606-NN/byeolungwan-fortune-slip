// 별자리 아이콘 SVG를 원본 파일 그대로 읽어 문서에 삽입한다.
// <img>로는 SVG 내부의 선 색을 바꿀 수 없어서, 원본은 수정하지 않고 CSS로 연결선 색만 조정하기 위해 인라인으로 넣는다.
// 28수별 아이콘이 생기면 star.iconPath만 바꾸면 된다.

const cache = new Map();

function load(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error(`${path} ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const svg = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
        if (svg.nodeName !== 'svg') throw new Error(`${path}: SVG가 아닙니다`);
        svg.removeAttribute('id'); // 같은 문서 안 id 충돌 방지
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        return svg;
      })
      .catch((err) => {
        cache.delete(path);
        throw err;
      }));
  }
  return cache.get(path);
}

export function preloadIcon(path) {
  load(path).catch(() => {});
}

export async function renderIcon(container, path) {
  container.dataset.iconPath = path || '';
  if (!path) {
    container.replaceChildren();
    return;
  }
  try {
    const svg = await load(path);
    if (container.dataset.iconPath === path) container.replaceChildren(svg.cloneNode(true));
  } catch (err) {
    console.error('별자리 아이콘을 불러오지 못했습니다', err);
    container.replaceChildren();
  }
}
