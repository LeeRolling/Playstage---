[中文](README.md)

# Juxitai

**Set up a little stage on your own computer, and make stories with AI characters.**

Think of it as a text version of playing pretend: choose where your story takes place, give each character a personality, say something, and let them continue the scene.

Juxitai is a **local app for text roleplay with multiple AI characters**. It provides a dark stage interface, worldbooks, character settings, and conversation management. You bring the AI model; the model supplies the characters' replies.

- **No account and no cloud sync.** Your worldbooks, characters, conversations, and saves are stored on your computer.
- **You choose the model.** Connect to local Ollama, Zhipu, Qwen, or another OpenAI-compatible cloud service.
- **No AI models or model download links are included.** You need to prepare your own model.

Local storage describes where your files are saved. **If you choose a cloud model, requests are sent to that cloud service.**

The English interface labels below describe the corresponding controls; they do not mean an English interface is available. Some interface messages and linked documents are in Chinese. Original file paths are preserved where necessary.

## Get started in 3 steps

### Step 1: Install Node.js

Install [Node.js](https://nodejs.org/). **Version 20 or later is recommended.**

Node.js is the tool that runs the app. You only need to install it once. Juxitai does not include Node.js or an AI model. Installing Node.js normally also installs `npm`, which manages the app's dependencies and is used to start and check the app.

#### Windows: Open a command window first

1. Find the **Windows key**, also called the **Win key**. It has a Windows logo and is usually between `Ctrl` and `Alt` near the bottom left of your keyboard. Some keyboards place it elsewhere; look for the logo.
2. **Hold the Win key, press the letter R once, then release both keys.** This is the `Win + R` shortcut.
3. A small **Run** window will usually appear near the bottom left of the screen.
4. Type the three letters `cmd` into its input box. Click **OK** or press **Enter**.
5. A command window will open, usually with a black background. Paste the commands below into this window, and press Enter after each one. **Do not paste them into a chat box or your browser's address bar.**

Check whether Node.js is already installed by running these commands separately:

```bat
node -v
```

```bat
npm -v
```

If the first command shows a version such as `v20`, `v22`, or `v24`, with a major version of **20 or higher**, and the second also shows a version number, you can continue to Step 2. The `npm` version does not need to be 20 or higher.

If a command is "not recognized as an internal or external command," or Node.js is older than version 20, use either installation method below.

#### Windows option A: Install with one command

On Windows 10 or 11, Microsoft's **WinGet** package manager can download and install Node.js **LTS**, short for Long-Term Support. This is a version maintained for everyday use. WinGet is the tool's name; the line below is the command to run.

Paste the whole line into the `cmd` window and press Enter:

```bat
winget install --id OpenJS.NodeJS.LTS --exact --source winget --interactive
```

Wait for the download, then follow the installer prompts. Read any license terms before accepting them. If Windows asks whether to allow changes to your device, confirm that the prompt is for this Node.js installation, then click **Yes**. An internet connection is required.

**Prefer to double-click a file?** If you also have the companion [install-node.bat](install-node.bat), double-click it. It checks your existing Node.js installation first. If the version is sufficient, it skips installation; otherwise, it runs the same WinGet command. You still need to respond to license and system permission prompts.

This `.bat` helper accompanies this README and must be supplied with it. It is not a feature already present in the original repository, and it does not include a Node.js installer.

If `winget` is unavailable, the download fails, or installation cannot finish, use the official installer below. For command options, see [Microsoft's WinGet installation documentation](https://learn.microsoft.com/en-us/windows/package-manager/winget/install).

#### Windows option B: Download the official installer

1. Open your browser and visit the [official Node.js download page](https://nodejs.org/en/download).
2. Choose **LTS**, with a major version of **20 or higher**.
3. Choose **Windows**. Most Intel or AMD computers use **x64**. Computers with ARM processors use **ARM64**. If unsure, open Windows **Settings → System → About** and check **System type**.
4. Choose **Windows Installer**, a file ending in `.msi`, and download it. The page layout may change; look for Windows, LTS, and `.msi`.
5. Open your browser's download list or your computer's **Downloads** folder, then double-click the downloaded `.msi` file.
6. Click **Next** in the installer.
7. Read the license terms. If you agree, select **I accept…**, then click **Next**.
8. Keep the default installation location and click **Next**. Keep the default components, including **npm** and **Add to PATH**. PATH lets your computer find the `node` and `npm` commands.
9. If an option for additional native module tools appears, you can leave it unchecked for this initial setup. If a dependency later explicitly requires those tools, follow its instructions.
10. Click **Install**. If Windows asks for permission, confirm that the prompt is for this installation, then click **Yes**.
11. Wait for installation to finish, then click **Finish**.

#### Check that installation worked

**Close your old command window. Press `Win + R`, type `cmd`, and open a new one.** The old window may not know about the tools you just installed.

Run `node -v` and `npm -v` again, separately. If both show version numbers and the Node.js major version is 20 or higher, you are ready to start Juxitai.

| Problem | What to try |
| --- | --- |
| Commands still cannot be found after installation | Close the old command window and open a new one. If needed, restart the computer and check again |
| Commands still cannot be found after restarting | Run the official installer again and check that Add to PATH and npm are included |
| Node.js still shows an old version | Reopen the command window. If it is still below 20, multiple installations or an old PATH entry may need attention |
| PowerShell blocks `npm` because scripts are disabled | Use `Win + R → cmd` and try in Command Prompt. You do not need to change the system's script policy for this guide |

#### Mac / Linux

On Mac, visit the [official Node.js download page](https://nodejs.org/en/download), choose the LTS macOS installer for your processor architecture, and download the `.pkg` file. Double-click it and follow the installer prompts.

On Linux, follow the official installation instructions appropriate for your distribution. Install an LTS version with a major version of 20 or higher. Steps differ between distributions; do not copy the Windows commands.

After installation, reopen your terminal and run `node -v` and `npm -v` separately. Both should show version numbers, and Node.js should be version 20 or higher.

### Step 2: Open Juxitai

Open the extracted project folder and start the app:

| System | How to start |
| --- | --- |
| Windows | Double-click `start.bat` |
| Mac / Linux | Open a terminal in the project folder and run `bash start.sh`. You can also run `npm start` for the same result |

If the browser does not open automatically, visit:

<http://127.0.0.1:4173>

This is a web address on your own computer.

### Step 3: Follow the introduction, choose a stage, and connect a model

On your first visit, follow the introduction, read and accept the disclaimer, then enter the stage.

Choose a stage and open the **Models** page in the left sidebar to configure a model. Return to **Roleplay**, write a message, and click **Send to Stage**. Detailed model setup instructions follow below.

The introduction checks Node.js and the Ollama connection. If the page opens, the Node.js check is considered passed. Ollama being offline does not stop you from choosing a stage; you can use a cloud model instead.

**On Windows, close the black startup window to stop Juxitai.**

## Choose a stage

A **worldbook** is a little handbook for your story: its atmosphere, conflicts, and things that are forbidden in that world. **Character settings** tell the AI who each character is and how they should speak.

There are three example stages, each with three default characters:

| Stage | Default characters |
| --- | --- |
| Frostmark Kingdom | Astrid, Sigrid, Elin |
| Qingxuan Realm | Nuanli, Yuetong, Qingyan |
| Neon Dome City | Chutang, Xingxuan, Xuejing |

The stages remain separate. Each scene uses one worldbook and invites that stage's three characters by default.

**These are example templates, not the only way to play.** You can edit worldbooks and character settings, and you are not limited to the three default characters.

Each worldbook already contains paths for location images. If an image is missing, the stage tells you that its path exists but the image is not there yet. See [default image placement instructions](assets/defaults/README.md).

## Connect a model so your characters can reply

Juxitai supplies the stage. The AI model is the actors' "brain." The app includes no models; replies come from the service selected on the **Models** page.

### Use local Ollama

Keep three different things in mind: **Ollama is installed, the model is downloaded, and the model is currently loaded for use.** These are separate steps. Having a kitchen does not mean you have bought the ingredients, and buying ingredients does not mean dinner is ready.

Prepare your own local language model, such as an open-source Qwen text model. We recommend downloading official open-source models only from official channels. **Downloaded model files still need to be imported or installed in Ollama using the appropriate format. Simply placing them in the Juxitai folder will not make them work.**

First check the model in Ollama, then connect Juxitai. See the [official Ollama CLI reference](https://docs.ollama.com/cli) for commands.

#### Step 1: Install and open Ollama

After installing Ollama, open it from the Windows Start menu or launch the Ollama app on Mac. Keep it running while you use the model.

Open a command window:

- **Windows:** Search for `PowerShell` in the Start menu and open it. Alternatively, press `Win + X` and select **Terminal (Admin)** from the menu.
- **Mac / Linux:** Open **Terminal**.

Enter the following commands in that window and press Enter. **Do not enter them in a browser address bar or the Juxitai chat box.** These Ollama checks do not require you to be in the Juxitai folder.

#### Step 2: Check the service and installed models

Run:

```bash
ollama ls
```

The model list usually has `NAME`, `ID`, `SIZE`, and `MODIFIED` columns. Look at `NAME`: it contains the full name you will use to run and select the model.

- **Model names appear:** Ollama can be reached, and those models are installed.
- **Only column headers appear:** Ollama can be reached, but there are no installed models to list. Prepare a model using its official instructions and Ollama's instructions, then check again.
- **A connection error appears, such as `could not connect to Ollama`:** The Ollama service may not be running, or the connection address may be wrong. Open Ollama again first.
- **The `ollama` command cannot be found:** Check that Ollama is installed, then close and reopen the command window before retrying.

If you run Ollama from the command line and its service is not running, open another terminal window and run:

```bash
ollama serve
```

Keep that service window open. Return to the first window and run `ollama ls` again. If you can already connect, do not run `ollama serve` again. An address or port already in use message may mean an Ollama service is already running.

**Seeing a model in `ollama ls` means it is installed. It does not prove it is currently loaded into RAM or GPU memory.**

#### Step 3: Ask the model for one reply

Copy the full model name from the `NAME` column of `ollama ls`, including any version tag after the colon.

Replace `YOUR_MODEL_NAME` below with that name, then run:

```bash
ollama run YOUR_MODEL_NAME "Please say hello in English."
```

**Do not type `YOUR_MODEL_NAME` literally.** For example, if your list shows `qwen2.5:7b`, use:

```bash
ollama run qwen2.5:7b "Please say hello in English."
```

This is only an example name. It does not mean that model is installed or suitable for your computer. Use a local text chat model already in your list, and make sure the selected Ollama model actually runs locally.

The first reply may take a little time while the model loads. **Getting an actual reply confirms that the model can respond in this test.**

If a download begins, check that the name exactly matches your installed model. `ollama run` may try to download a model that is not present locally. If loading fails or there is not enough memory, get the model working in Ollama first, then connect Juxitai.

#### Step 4: Check that the model is loaded now

Immediately after the reply, run:

```bash
ollama ps
```

**If your model appears here, it is currently loaded into RAM or GPU memory.** If only the headers appear, no model is currently loaded. It may not have been called yet, or it may have been unloaded after sitting idle. This does not mean the model files were deleted.

To check whether your graphics card is being used, look at `PROCESSOR`:

| Value | Meaning |
| --- | --- |
| `100% GPU` | The model is loaded entirely on the graphics card |
| `100% CPU` | The model is loaded entirely in system RAM and uses the CPU |
| Percentages for both CPU and GPU | The model is split between system RAM and the graphics card |

`UNTIL` shows how long the model is currently expected to remain loaded. By default, Ollama unloads a model after about 5 minutes of inactivity, but settings or requests can change this. Juxitai's preloading feature has its own retention behavior, described below.

See the [official Ollama FAQ](https://docs.ollama.com/faq) for loading, CPU/GPU use, and unloading. **An installed model, a loaded model, and a model that successfully answers are three separate checks.**

#### Step 5: Select the model in Juxitai

1. Open **Models** in the left sidebar.
2. The local address is normally `http://127.0.0.1:11434`. `http://127.0.0.1:11434/v1` also works. **This is Ollama's address. The Juxitai web page uses port `4173`; do not mix them up.**
3. Click **Read Local Models** and select the model you just tested. Check that the full name matches.
4. For your first test, choose **Local Only**, then click **Save Settings**. A local failure will be shown directly, so an automatic cloud fallback cannot make you think the local connection succeeded.
5. Return to **Roleplay**, write "Hello, please introduce yourself in English," and click **Send to Stage**.
6. Check the reply and the service indicator for that response. You can also immediately run `ollama ps` to check whether the selected model is loaded.

After a successful test, you can switch back to **Automatic: Local First, Otherwise Cloud** and save again. Selecting **No Local Model** clears the local model name.

**You do not need to run `ollama run` before every session.** With the Ollama service running, the model installed, and the correct model selected, Juxitai's request can cause Ollama to load it. The commands above help you find which step is working and which is not.

#### If something goes wrong

| Problem | What to check first |
| --- | --- |
| Juxitai cannot read local models | Run `ollama ls` first. Once models appear, check that Juxitai's local address is `http://127.0.0.1:11434`, then read the list again |
| A model appears in `ollama ls` but not `ollama ps` | It is installed but not currently loaded. Ask it for a reply, or click Preload Now in Juxitai, then check immediately |
| The model answers in the terminal but not in Juxitai | Check the address and full model name, save settings, retry with Local Only, and read the Chinese error message |
| A character answers, but you are unsure whether it was local | Check the service indicator and test again with Local Only. A reply alone does not prove the local model was used |
| Loading fails because of insufficient memory | Try a smaller local model or close other programs using RAM or GPU memory. You can also use a cloud model |
| `PROCESSOR` shows CPU and replies are slow | The model is currently using the CPU. Check Ollama's hardware documentation for GPU support and driver requirements |

#### What happens if the local model is unavailable?

If Ollama is closed, the model is missing, or the local model name was cleared, **Automatic mode tries a configured cloud model instead**. This requires a valid API key and model name for Zhipu, Qwen, or **Another Cloud Provider**, such as DeepSeek. The interface tells you which service handled that reply.

In **Local Only** mode, the app stops and asks you to return to local model selection.

#### Spend less time waiting: Preloading

Enable **Preload Model**, then click **Preload Now**. The selected local model stays loaded, reducing the wait from repeatedly loading and unloading it between messages.

- After about **10 minutes** without a local reply request, the memory used by the model is released.
- Click **Unload** to release it manually.
- Turning off preloading and saving settings also unloads the model.
- When Automatic mode falls back to the cloud, cloud requests do not include preloading settings. The local model's memory is still released after it becomes idle.

### Use a cloud model

Use Zhipu, Qwen, or configure an OpenAI-compatible endpoint under **Another Cloud Provider**, such as DeepSeek or Moonshot Kimi.

An **API key** is the key that lets you call a cloud model. **It is stored only in `data/library.json` on this computer. Do not share or publish it.**

| Service | What to prepare |
| --- | --- |
| Zhipu | Apply for an API key on the Zhipu open platform. A common model name is `glm-4-flash`. The endpoint is prefilled and normally does not need changing |
| Qwen | Apply for an API key on Alibaba Cloud Bailian. A common model name is `qwen-plus`. The endpoint is prefilled |
| Another Cloud Provider | Enter its OpenAI-compatible endpoint, API key, and model name |

To set it up:

1. Open **Models**, choose **Prefer Zhipu for Cloud** or **Prefer Qwen for Cloud**, and enter the key and model name. Enter other services under **Another Cloud Provider**.
2. Choose **Automatic** or **Cloud Only**.
3. Click **Save Settings**, then the corresponding **Test** button.
4. Return to the stage and send a message.

An incorrect API key or too many requests produces a Chinese message in the dialogue interface.

**Automatic mode still uses the local model first whenever it can respond.** The cloud preference selects which provider to prefer when a cloud model is used.

### Not sure what your computer can run?

Check <https://www.canirun.ai/models>.

Around 8GB of GPU memory usually gives you some suitable text model options. Around 4GB can work with lighter models, but the experience is limited. These are rough guidelines, not a performance guarantee. If no suitable local model is available, you can use a cloud model.

## Where are my stories saved?

Worldbooks, character settings, conversations, and saves are stored in:

```text
data/library.json
```

Your saves, cloud keys, and personal images are kept in `data/`. **Copy the entire `data/` folder to make a backup.** Keep it safe: there are no accounts, cloud saves, or cloud sync.

**Do not send `data/library.json` to anyone, including people you trust.** It may contain your cloud API keys. Treat a backup of `data/` as private material containing credentials, too.

### Older data and starting fresh

If you used an earlier preview version, the next startup automatically migrates `data/library.json` to the three-stage format. It tries to preserve your disclaimer acceptance and existing model addresses and API keys.

**Conversations from the old Empty Stage are not migrated.**

To start fresh, make a backup first, move `data/library.json` out of its current location, and restart the app. Seed content is also stored in `data/library.seed.json`.

## What can you do in this version?

### Chat and roleplay

- **Start with a stage:** Choose a stage on your first visit. Each scene uses one worldbook.
- **Group or one-to-one chat:** Two or more characters make a group chat. Keep only one character for a one-to-one conversation.
- **Limit interruptions:** A round of character interruptions allows at most two replies, followed by a cooldown to prevent endless back-and-forth.
- **Choose the reply model:** Use local Ollama, Zhipu, Qwen, or another OpenAI-compatible service. Read the local model list and select a model directly. The next time you open the app, it reminds you to test the local connection again.

### Characters and backgrounds

- **Stage layout:** Full-body character images stand behind a translucent dialogue box. The current speaker's avatar appears on its left. Once a background image is configured, the default curtain no longer covers it.
- **Location backgrounds:** Mentioning a location name changes the background. Day and night can be switched. A special scene without its own image falls back to the location background.
- **Custom locations and images:** Add locations to a worldbook. Avatars, full-body images, and location images can be cropped before saving.
- **Default full-body images:** Character cards already contain default image paths. Put the corresponding images in `assets/defaults` to display them.
- **Thinking images:** Set an optional thinking full-body image for a character. While that character waits for a model reply, the stage uses it; after the reply, the normal image returns. Without a thinking image, no switch occurs.
- **Action and expression assets:** A character card's Actions and Expressions section lets you configure ten expression images and eleven action images. New images are written to `assets/characters/角色名/表情` and `assets/characters/角色名/动作`, where the segments mean character name, expressions, and actions. These original path spellings are retained. The stage still uses full-body images. **Automatic action and expression switching during model replies is not implemented yet.** See [Actions and Expressions](docs/动作与表情.md).

### Four interface skins

Choose from **Classic, Eastern · Qingxuan, Cyber · Neon Dome, and Nordic · Frostmark**.

With **Follow Stage**, changing stages automatically changes the skin. Clicking a particular skin on the right fixes that selection.

See [Custom Skins](docs/自定义皮肤.md) to change colors. The settings are:

| Setting | Values |
| --- | --- |
| `settings.uiSkin` | `classic` / `eastern` / `cyber` / `nordic` |
| `settings.uiSkinMode` | `auto`: follow the stage; `manual`: keep a fixed skin |

## What is not finished yet?

Some controls and interfaces are in place, but their current capabilities are limited:

| Feature | Current state |
| --- | --- |
| Save, import, and export controls | Controls exist, but **export only creates a placeholder file, and import only registers the import**. Do not use them as complete backup or restore tools. Copy the entire `data/` folder for backups |
| Automatic action and expression switching | Assets can be configured, but automatic switching during model replies is not implemented. The stage still uses full-body images |
| Different models for different characters | Per-character interfaces are reserved, but **this version uses the same selected model service for the whole scene** |
| Migration of old Empty Stage conversations | These conversations are not migrated to the new three-stage format |

## Checks and updates

### Check that the app is working

| System | How to check |
| --- | --- |
| Windows | Double-click `check.bat` |
| Mac / Linux | Run `npm run check` in the project folder |

When successful, the window displays a Chinese message meaning **Check passed**. If a check fails, take a screenshot of the output first. Do not rush to update.

### Will updates change my saves?

At startup, the app checks `VERSION` on the public repository's `main` branch, trying GitHub directly first. If that connection fails, it retries through public GitHub mirrors. Tokens are never sent to those mirrors. When a new version is found, only program files are replaced. **Your saves, cloud keys, and personal images in `data/` are left alone.**

The current version starts normally in any of these cases:

- Neither direct GitHub nor the mirrors can be reached.
- You have placed `data/skip-update.txt` in the project.

Keep your own `data/` folder safe regardless.

## Before you use it

Juxitai provides the software only. **It does not supply or bundle AI models, and it does not provide model download links.**

You are responsible for where you obtain a model and whether you can use it. We recommend downloading official open-source models only from their official channels.

Adult or sensitive content depends on the model you choose and your own judgment. Juxitai does not claim to have reviewed your model for you. Read and accept the disclaimer on your first visit.

## For developers: Keep the interface and rules separate

The code has three parts:

| Path | Responsibility |
| --- | --- |
| `src/ui` | The interface; communicates only through the local web API |
| `src/domain` | Rules for worldbooks, character settings, conversations, and saves; does not import the UI |
| `src/server` | Connects the interface and the rules |

**When changing appearance, do not put domain rules in the page. When changing rules, do not change the canvas.**

Double-click `check.bat`, or run this in the project folder:

```bash
npm run check
```

Before releasing a test build, pass the checks first, then update the version number and update manifest.

See [the product specification](docs/PRD.md).

## Open source and license

This is a **public repository**. The software is released under the [MIT License](LICENSE).

Copyright © 2026 LeeRolling.

The software is open source. Your worldbooks, saves, and cloud keys remain on your computer and are not material to publish with the software.
