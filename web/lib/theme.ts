/** 첫 페인트 전에 테마 적용(깜빡임 방지). 기본 라이트, 저장된 선택이 dark 면 다크. */
export const themeScript = `(function(){try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`;
