# MY HEALTH AI

Apple WatchとiPhoneのヘルスケアデータを使って、毎日の体調の変化を分析するiPhoneアプリです。

## 方針

- 健康データ・音声は **端末の中だけ** で処理する
- 取得できないデータは **「データ未取得」** と表示し、架空の値は出さない
- 医学的な診断はしない

## 開発のしくみ（Macなし）

1. Claude Code（クラウド）でSwiftコードを書く
2. GitHubに保存すると、GitHub Actions（ネット上のMac）が自動でビルドをチェック
3. Apple Developer Program登録後は、TestFlight経由でiPhoneにインストール

Xcodeのプロジェクトファイルは `project.yml` から [XcodeGen](https://github.com/yonaskolb/XcodeGen) で自動生成します。

## 進み具合

| STEP | 内容 | 状態 |
|---|---|---|
| 1 | 技術調査 | ✅ |
| 2 | システム構成・DB設計 | ✅（案） |
| 3 | 画面の土台（5タブ） | ✅ |
| 4 | HealthKit連携 | ⏳ |
| 5 | 健康データの取得と表示 | ⏳ |
| 6 | AI健康分析 | ⏳ |
| 7 | 睡眠音・いびき検知 | ⏳ |
| 8 | テスト・不具合修正 | ⏳ |
| 9 | 公開準備 | ⏳ |

## 秘密情報について

APIキー・証明書・パスワードはコードに書かず、GitHubの **Secrets** に保存します。
