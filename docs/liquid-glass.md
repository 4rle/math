# LiquidGlassの組み込み

- 提供元：Youness Bouane / [ybouane/liquidglass](https://github.com/ybouane/liquidglass)
- npm：[`@ybouane/liquidglass`](https://www.npmjs.com/package/@ybouane/liquidglass) **1.0.3** に固定
- ライセンス：MIT（上流のREADMEとpackage.jsonの表記）

`src/LiquidSurface.tsx`は、上流の公開された`LiquidGlass`コンストラクターと`renderer` APIを使うReact用アダプターです。屈折・ぼかし・Fresnel反射・ベベル・影のWebGLシェーダーは指定パッケージの実装をそのまま実行します。Three.jsや別のガラスライブラリへの置き換えではありません。

カード、参考書タブ、選択時の評価パネル、評価スライダーのレールとつまみに適用します。つまみは別の材質面として手前へ浮かべ、ドラッグ時に少し大きくします。文字・フォーム・フォーカス・クリック処理はHTMLに残し、材質用canvasはポインター操作と読み上げの対象外にします。メニュー面には適用しません。タイルは実際のDOMごと3D面に配置され、メニューを開くとほぼ真横になります。タブバーは独立した手前の層に配置し、回転せず右へスライドしてフェードアウトします。

材質の入力は白い机の明暗を表すローカルなライティング画像です。評価パネルには背後のカードの材質canvasも合成します。文字を含むページ全体のライブキャプチャや、物理的な光線追跡は行いません。上流の自動DOMキャプチャとドラッグ処理を起動しないことで、既存のスクロール・カードドラッグ・評価操作との競合を避けます。

描画器は全体で1つ。画面内にある素材だけを、サイズ変更・表示・ホバー・押下に応じて描画します。画面外のcanvasは1×1に戻し、描画サイズのキャッシュと解像度にも上限を設けます。静止中は描画ループを止めます。WebGL非対応時とコンテキスト喪失中には既存のCSS材質を使用し、復帰後に再描画します。

上流1.0.3はnpmの`postinstall`から`patch-package`を呼び出しますが、そのコマンドをランタイム依存に含めていません。このため、このプロジェクトの開発依存に`patch-package`を追加しています。独自パッチは適用していません。Cloudflareを含め、通常のビルドでは開発依存も含めて`npm ci`→`npm run build`を実行してください。

評価は左Eから右Aへの5段階で、初期位置を未選択と区別します。12px以上ドラッグし、段階に近い位置で離したときだけ自動保存。タップのみはプレビュー、境界でのリリースは確認待ち、pointercancelやフォーカス喪失は元の選択へ戻します。振動は対応端末でユーザー操作時だけ要求し、非対応・拒否で保存処理を止めません。

振動の互換性参考：[MDN Navigator.vibrate](https://developer.mozilla.org/docs/Web/API/Navigator/vibrate) / [Browser Compatibility Data](https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json)。Safariは非対応。APIが存在してもOS設定やブラウザーの方針で振動しない場合があり、表示による段階の確認は常に用意します。
