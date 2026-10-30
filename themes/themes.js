// 使えるテーマの一覧。新しいテーマは、CSS ファイルを themes/ に置いて、ここに1行足します。
//   id   : CSS の .theme-◯◯ の「◯◯」と同じ（半角英数とハイフン）
//   name : 選択欄に表示する名前
//   css  : CSS ファイルの場所（index.html からの相対パス）
window.MDSLIDE_THEMES = [
  { id: 'light',  name: 'Light',    css: 'themes/light.css' },
  { id: 'dark',   name: 'Dark',     css: 'themes/dark.css' },
  { id: 'rabbit', name: 'Rabbit風', css: 'themes/rabbit.css' },
  // { id: 'my-theme', name: 'マイテーマ', css: 'themes/my-theme.css' },
];
