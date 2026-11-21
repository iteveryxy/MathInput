import type { Snippet, SnippetParameter } from '../snippets/types';
import { renderSnippet } from '../snippets/SnippetRegistry';
import { MathEditor } from '../editor/MathEditor';
import { CompletionPopup } from '../completion/CompletionPopup';
import { ParameterTooltip } from './ParameterTooltip';
import { FormulaPackService } from '../packs/FormulaPackService';
import { BASE_PACK, commandConflicts, packDisplayName, packEntries, snippetDisplayName, UNIVERSITY_PACKS } from '../packs/FormulaPacks';
import { BASE_PACK_ID, MY_PACK_ID, PACK_LIMITS, candidateId, snippetKey, type FormulaPack } from '../packs/types';
import { parsePack, validatePack } from '../packs/Validation';
import { checkPackMath, renderMathPreview } from '../packs/MathPreview';
import { choosePackFiles, exportPackFile, packFileError, type PackImportBatch } from '../packs/PackFiles';
import type { CustomAliases } from '../completion/AliasResolver';
import { t, tr, translatedError } from '../platform/Language';
const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] => { const el = document.createElement(tag); el.textContent = text; el.className = className; return el; };
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const formulaCount = (count: number) => tr(`${count} 个公式`, `${count} ${count === 1 ? 'formula' : 'formulas'}`);
const parameterCount = (count: number) => tr(`${count} 个参数`, `${count} ${count === 1 ? 'parameter' : 'parameters'}`);
function button(text: string, action: () => void, aria = text): HTMLButtonElement { const b = element('button', text); b.type = 'button'; b.setAttribute('aria-label', aria); b.addEventListener('click', action); return b; }
function input(form: HTMLElement, label: string, value = '', multiline = false): HTMLInputElement | HTMLTextAreaElement {
    const l = element('label', label);
    const field = multiline ? element('textarea') : element('input');
    field.value = value;
    field.setAttribute('aria-label', label);
    if (field instanceof HTMLTextAreaElement)
        field.rows = 3;
    l.append(field);
    form.append(l);
    return field;
}
export class FormulaPackManager {
    readonly element = element('section', '', 'pack-manager');
    private selected = BASE_PACK_ID;
    private query = '';
    private editing = false;
    private playground?: MathEditor;
    private playgroundPopup?: CompletionPopup;
    private message = '';
    private queued: PackImportBatch = { files: [], skipped: 0 };
    constructor(readonly service: FormulaPackService, private readonly aliases: () => CustomAliases, private readonly closed: () => void) {
        this.element.id = 'formula-pack-manager';
        this.element.hidden = true;
        service.changed.add(() => { if (!this.element.hidden && !this.editing)
            this.render(); });
    }
    async open(latex?: string): Promise<void> {
        this.element.hidden = false;
        document.body.classList.add('packs-open');
        this.render();
        if (latex !== undefined) {
            if (!this.service.state.packs.some(entry => entry.pack.id === MY_PACK_ID)) {
                try {
                    await this.service.install({ schemaVersion: 1, id: MY_PACK_ID, name: '我的公式', version: '1.0.0', author: '', description: '保存在本机的自定义公式', snippets: [] });
                }
                catch (error) {
                    this.showError(error);
                    return;
                }
            }
            this.editFormula(MY_PACK_ID, { id: newId('formula'), command: '', aliases: [], name: '', description: '', latex, parameters: [] });
        }
    }
    close(): void { this.disposePlayground(); this.element.hidden = true; this.editing = false; document.body.classList.remove('packs-open'); this.closed(); }

    receiveFiles(batch: PackImportBatch): void {
        if (!batch.files.length && !batch.skipped) return;
        if (this.editing) {
            const room = PACK_LIMITS.packs - this.queued.files.length;
            this.queued.files.push(...batch.files.slice(0, room));
            this.queued.skipped += batch.skipped + Math.max(0, batch.files.length - room);
            this.showError(tr('文件已排队。返回公式包列表可查看。', 'Files queued. Return to the formula pack list to review them.'), false);
            return;
        }
        this.element.hidden = false;
        document.body.classList.add('packs-open');
        this.previewFiles(batch);
    }
    private disposePlayground() { this.playgroundPopup?.destroy(); this.playground?.field.remove(); this.playground = undefined; this.playgroundPopup = undefined; }
    private start(title: string): HTMLElement {
        this.disposePlayground();
        this.element.replaceChildren();
        const header = element('div', '', 'pack-header');
        header.append(element('h2', title), button(t('返回编辑器'), () => {
            if (this.editing)
                this.confirm(t('放弃未保存的表单内容并返回编辑器？'), () => this.close());
            else
                this.close();
        }));
        const status = element('p', this.service.error || this.message, 'pack-status');
        status.id = 'pack-status';
        status.setAttribute('role', 'status');
        this.element.append(header, status);
        const body = element('div', '', 'pack-body');
        this.element.append(body);
        return body;
    }
    private showError(error: unknown, isError = true) { const node = this.element.querySelector('#pack-status'); if (node) {
        node.textContent = translatedError(error instanceof Error ? error.message : String(error));
        node.classList.toggle('error', isError);
    } }
    private async perform(action: () => Promise<void>) { try {
        await action();
        this.message = t('已保存在本机');
        this.render();
    }
    catch (error) {
        this.showError(error);
    } }
    private pack(id = this.selected): FormulaPack { return id === BASE_PACK_ID ? BASE_PACK : this.service.state.packs.find(entry => entry.pack.id === id)!.pack; }
    private confirm(message: string, action: () => void): void {
        const dialog = element('div', '', 'pack-confirm');
        dialog.setAttribute('role', 'alertdialog');
        dialog.setAttribute('aria-label', t('确认删除或放弃'));
        dialog.append(element('p', message), button(t('取消'), () => dialog.remove()), button(t('确认'), () => { dialog.remove(); action(); }));
        this.element.append(dialog);
    }
    private render(): void {
        this.editing = false;
        const body = this.start(t('公式包'));
        if (this.service.error)
            body.append(button(t('从本地备份恢复'), () => this.confirm(t('从上次成功保存的备份恢复公式库？当前损坏文件会另存保留。'), () => { void this.perform(() => this.service.recover()); })));
        const toolbar = element('div', '', 'pack-toolbar');
        toolbar.append(button(t('导入公式包'), () => { void this.importFile(); }), button(t('创建公式包'), () => this.editPack()), button(t('粘贴 JSON 导入'), () => this.importText()));
        if (this.queued.files.length || this.queued.skipped) {
            toolbar.append(button(tr('查看排队的文件', 'Review queued files'), () => {
                const batch = this.queued;
                this.queued = { files: [], skipped: 0 };
                this.previewFiles(batch);
            }));
        }
        if (this.service.ready && UNIVERSITY_PACKS.some(pack => !this.service.state.packs.some(entry => entry.pack.id === pack.id))) {
            toolbar.append(button(t('添加随附本科公式包'), () => { void this.perform(() => this.service.addUniversityPacks()); }));
        }
        body.append(toolbar, element('p', tr('可将一个或多个 JSON 文件拖到窗口。', 'Drop one or more JSON files onto the window.'), 'settings-note'));
        const grid = element('div', '', 'pack-layout');
        const list = element('nav', '', 'pack-list');
        list.setAttribute('aria-label', t('公式包列表'));
        for (const entry of packEntries(this.service.state)) {
            const row = element('div', '', 'pack-row');
            row.dataset.packId = entry.pack.id;
            const checkbox = element('input');
            checkbox.type = 'checkbox';
            checkbox.checked = entry.enabled;
            checkbox.disabled = !this.service.ready;
            const packName = packDisplayName(entry.pack.id, entry.pack.name);
            checkbox.setAttribute('aria-label', tr(`启用 ${packName}`, `Enable ${packName}`));
            checkbox.addEventListener('change', () => { const enabled = checkbox.checked; checkbox.disabled = true; void this.service.toggle(entry.pack.id, enabled).catch(error => { checkbox.checked = !enabled; checkbox.disabled = false; this.showError(error); }); });
            const pick = button(packName, () => { this.selected = entry.pack.id; this.query = ''; this.render(); }, tr(`查看 ${packName}`, `View ${packName}`));
            pick.classList.toggle('selected', this.selected === entry.pack.id);
            row.append(checkbox, pick, element('small', `${formulaCount(entry.pack.snippets.length)} · ${entry.builtin ? t('内置') : t('用户包')}`));
            list.append(row);
            const invalid = this.service.invalidPacks.get(entry.pack.id);
            if (invalid)
                row.append(element('small', tr(`解析异常，已隔离：${invalid}`, `Pack disabled because it could not be parsed: ${invalid}`), 'error'));
        }
        grid.append(list);
        const details = element('div', '', 'pack-details');
        grid.append(details);
        body.append(grid);
        if (!packEntries(this.service.state).some(entry => entry.pack.id === this.selected))
            this.selected = BASE_PACK_ID;
        const pack = this.pack();
        const packName = packDisplayName(pack.id, pack.name);
        const author = pack.author || t('未署名');
        details.append(element('h3', packName), element('p', tr(
            `版本 ${pack.version} · 作者 ${author}`, `Version ${pack.version} · Author ${author}`,
        )), element('p', pack.description));
        const actions = element('div', '', 'pack-toolbar');
        actions.append(button(t('导出 JSON'), () => { void exportPackFile(pack).then(path => { if (path) {
            this.message = tr(`已导出：${path}`, `Exported to ${path}`);
            this.render();
        } }).catch(error => this.showError(error)); }));
        if (pack.id !== BASE_PACK_ID)
            actions.append(button(t('编辑公式包'), () => this.editPack(pack)), button(t('新增公式'), () => this.editFormula(pack.id)), button(t('删除公式包'), () => this.confirm(
                tr(`删除“${packName}”及其中 ${pack.snippets.length} 条公式？已插入的草稿不受影响。`, `Delete ${packName} and its ${formulaCount(pack.snippets.length)}?`),
                () => { void this.perform(() => this.service.remove(pack.id)); },
            )));
        details.append(actions);
        const conflicts = commandConflicts(this.service.state, this.aliases()).filter(conflict => conflict.sources.some(source => source.packId === pack.id));
        if (conflicts.length) {
            const box = element('div', '', 'pack-conflicts');
            box.setAttribute('role', 'status');
            for (const conflict of conflicts) {
                const sources = conflict.sources.map(source => `${packDisplayName(source.packId, source.packName)} / ${source.formula} (${t(source.kind)})`).join(' · ');
                box.append(element('p', tr(`冲突 ${conflict.name}：${sources}。输入时可选择来源。`, `Multiple matches for ${conflict.name}: ${sources}. Choose a source when inserting.`)));
            }
            details.append(box);
        }
        const search = input(details, t('搜索公式'), this.query);
        const formulas = element('div', '', 'formula-list');
        details.append(formulas);
        const fill = () => {
            formulas.replaceChildren();
            const q = this.query.toLowerCase();
            for (const snippet of pack.snippets.filter(snippet => [snippetDisplayName({ ...snippet, packId: pack.id }), snippet.name, snippet.command, ...snippet.aliases].some(value => value.toLowerCase().includes(q)))) {
                const row = element('article', '', 'formula-row');
                row.dataset.formulaId = snippet.id;
                const displayName = snippetDisplayName({ ...snippet, packId: pack.id });
                const aliases = snippet.aliases.join(', ') || t('无');
                row.append(element('strong', `${snippet.command} · ${displayName}`), element('small', `${parameterCount(snippet.parameters.length)} · ${tr('别名', 'Aliases')} ${aliases}`));
                const preview = element('div', '', 'formula-preview');
                try {
                    renderMathPreview(preview, renderSnippet(snippet));
                }
                catch (error) {
                    preview.textContent = tr(`预览失败：${String(error)}`, `Preview failed: ${String(error)}`);
                    preview.classList.add('error');
                }
                row.append(preview, element('p', pack.id === BASE_PACK_ID ? t(snippet.description) : snippet.description));
                if (pack.id !== BASE_PACK_ID) {
                    const controls = element('div', '', 'pack-toolbar');
                    controls.append(button(t('编辑'), () => this.editFormula(pack.id, snippet, snippet.id), `${t('编辑')} ${displayName}`),
                        button(t('复制'), () => this.editFormula(pack.id, { ...structuredClone(snippet), id: newId('formula'), command: (snippet.command.slice(0, 32) + 'copy'), aliases: [], name: snippet.name + tr(' 副本', ' copy') }), `${t('复制')} ${displayName}`),
                        button(t('删除'), () => this.confirm(tr(`删除公式“${displayName}”？`, `Delete ${displayName}?`), () => {
                            void this.perform(() => this.service.install({ ...pack, snippets: pack.snippets.filter(item => item.id !== snippet.id) }, true));
                        }), `${t('删除')} ${displayName}`));
                    row.append(controls);
                }
                formulas.append(row);
            }
            if (!formulas.children.length)
                formulas.append(element('p', t('没有匹配的公式')));
        };
        search.addEventListener('input', () => { this.query = search.value; fill(); });
        fill();
    }
    private editPack(pack?: FormulaPack): void {
        this.editing = true;
        const body = this.start(pack ? t('编辑公式包') : t('创建公式包'));
        const form = element('form');
        body.append(form);
        const id = input(form, t('公式包 ID'), pack?.id ?? newId('pack'));
        id.readOnly = !!pack;
        const name = input(form, t('公式包名称'), pack?.name ?? '');
        const version = input(form, t('公式包版本'), pack?.version ?? '1.0.0');
        const author = input(form, t('作者'), pack?.author ?? '');
        const description = input(form, t('公式包描述'), pack?.description ?? '', true);
        const save = element('button', t('保存公式包'), 'primary');
        save.type = 'submit';
        form.append(button(t('取消编辑'), () => this.render()), save);
        form.addEventListener('submit', event => { event.preventDefault(); void this.perform(() => this.service.install(validatePack({ schemaVersion: 1, id: id.value, name: name.value, version: version.value, author: author.value, description: description.value, snippets: pack?.snippets ?? [] }), !!pack)); });
    }
    private async importFile(): Promise<void> { try {
        const batch = await choosePackFiles();
        if (batch.files.length === 1 && batch.files[0].contents !== null && !batch.skipped && !this.editing) {
            this.importText(batch.files[0].contents);
        } else {
            this.receiveFiles(batch);
        }
    }
    catch (error) {
        this.showError(error);
    } }
    private previewFiles(batch: PackImportBatch): void {
        this.editing = true;
        const body = this.start(tr('批量导入公式包', 'Import formula pack files'));
        const options: { pack: FormulaPack; id: HTMLInputElement; selected: HTMLInputElement; replace: HTMLInputElement }[] = [];
        const seen = new Set<string>();
        if (batch.skipped) {
            body.append(element('p', tr(
                `本次最多读取 ${PACK_LIMITS.packs} 个文件，已略过 ${batch.skipped} 个。`,
                `Up to ${PACK_LIMITS.packs} files per import. ${batch.skipped} skipped.`,
            ), 'error'));
        }
        const list = element('div', '', 'import-preview');
        body.append(list);
        for (const file of batch.files) {
            const row = element('section', '', 'formula-row');
            row.append(element('h3', file.name));
            list.append(row);
            try {
                if (file.contents === null) throw new Error(packFileError(file.error));
                const pack = parsePack(file.contents);
                checkPackMath(pack);
                const selected = element('input');
                selected.type = 'checkbox';
                selected.checked = !seen.has(pack.id) && pack.id !== BASE_PACK_ID;
                const include = element('label', tr('导入此文件', 'Import this file'));
                include.prepend(selected);
                row.append(include, element('p', `${packDisplayName(pack.id, pack.name)} · ${pack.version} · ${formulaCount(pack.snippets.length)}`));
                const id = input(row, t('导入包 ID'), pack.id) as HTMLInputElement;
                const replace = element('input');
                replace.type = 'checkbox';
                const replaceLabel = element('label', t('替换现有公式包'));
                replaceLabel.prepend(replace);
                row.append(replaceLabel);
                const status = element('small');
                row.append(status);
                const filenameHint = () => {
                    const exists = this.service.state.packs.some(entry => entry.pack.id === id.value);
                    replaceLabel.hidden = !exists;
                    status.textContent = id.value === BASE_PACK_ID ? t('基础数学包不可替换；请更换导入包的 ID') : exists
                        ? tr('这个 ID 已存在。可修改 ID，或勾选替换。', 'This ID already exists. Enter a different ID or select Replace.')
                        : '';
                };
                id.addEventListener('input', () => { replace.checked = false; filenameHint(); });
                filenameHint();
                if (seen.has(pack.id)) status.textContent = tr('与本次其他文件的 ID 重复。可改 ID 后勾选导入。', 'This ID repeats within the batch. Change it before selecting this file.');
                seen.add(pack.id);
                options.push({ pack, id, selected, replace });
            } catch (error) {
                row.append(element('p', error instanceof Error ? error.message : String(error), 'error'));
            }
        }
        const actions = element('div', '', 'pack-toolbar');
        const submit = button(tr('导入选中的公式包', 'Import selected packs'), () => {
            const items = options.filter(option => option.selected.checked).map(option => ({
                pack: { ...option.pack, id: option.id.value }, replace: option.replace.checked,
            }));
            if (!items.length) {
                this.showError(tr('请选择至少一个可导入的公式包。', 'Select at least one formula pack.'));
                return;
            }
            submit.disabled = true;
            void this.perform(async () => {
                await this.service.installBatch(items);
                this.selected = items[0].pack.id;
            }).finally(() => { submit.disabled = false; });
        });
        submit.disabled = !options.length;
        actions.append(submit, button(t('取消导入'), () => this.render()));
        body.append(actions);
    }
    private importText(raw = ''): void {
        this.editing = true;
        const body = this.start(t('导入公式包预览'));
        const source = input(body, t('公式包 JSON'), raw, true);
        source.id = 'pack-import-json';
        const preview = element('div', '', 'import-preview');
        body.append(button(t('校验并预览'), () => {
            try {
                const pack = parsePack(source.value);
                checkPackMath(pack);
                preview.replaceChildren();
                preview.append(element('h3', packDisplayName(pack.id, pack.name)), element('p', `${formulaCount(pack.snippets.length)} · ${pack.version} · ${pack.author}`));
                const id = input(preview, t('导入包 ID'), pack.id);
                const replacement = element('label', t('替换同 ID 的现有用户包（保留启用状态）'));
                const replace = element('input');
                replace.type = 'checkbox';
                replace.setAttribute('aria-label', t('替换现有公式包'));
                id.addEventListener('input', () => { replace.checked = false; });
                replacement.prepend(replace);
                preview.append(replacement);
                const draft = structuredClone(this.service.state);
                draft.packs = draft.packs.filter(entry => entry.pack.id !== pack.id);
                draft.packs.push({ pack, enabled: true });
                for (const conflict of commandConflicts(draft, this.aliases())) {
                    const sources = conflict.sources.map(source => packDisplayName(source.packId, source.packName)).join(' / ');
                    preview.append(element('p', tr(`命令冲突 ${conflict.name}：${sources}。输入时可选择来源。`, `Multiple matches for ${conflict.name}: ${sources}. Choose a source when inserting.`), 'pack-conflicts'));
                }
                for (const snippet of pack.snippets) {
                    const item = element('p', `${snippet.command} · ${snippet.name} · ${parameterCount(snippet.parameters.length)}`);
                    const math = element('span', '', 'formula-preview');
                    renderMathPreview(math, renderSnippet(snippet));
                    item.append(math);
                    preview.append(item);
                }
                preview.append(button(t('确认导入'), () => { void this.perform(async () => { const checked = validatePack({ ...pack, id: id.value }); await this.service.install(checked, replace.checked); this.selected = checked.id; }); }));
            }
            catch (error) {
                preview.replaceChildren();
                this.showError(error);
            }
        }), button(t('取消导入'), () => this.render()), preview);
    }
    private editFormula(packId: string, initial?: Snippet, editingId?: string): void {
        this.editing = true;
        const body = this.start(editingId ? t('编辑公式') : t('创建自定义公式'));
        const form = element('form');
        form.id = 'formula-editor-form';
        body.append(form);
        const id = initial?.id ?? newId('formula');
        const parameters: SnippetParameter[] = structuredClone(initial?.parameters ?? []);
        const name = input(form, t('公式名称'), initial?.name ?? '');
        const command = input(form, t('命令缩写'), initial?.command ?? '');
        const aliases = input(form, t('公式别名'), initial?.aliases.join(',') ?? '');
        const description = input(form, t('公式说明'), initial?.description ?? '', true);
        const packLabel = element('label', t('所属公式包'));
        const destination = element('select');
        destination.setAttribute('aria-label', t('所属公式包'));
        for (const entry of this.service.state.packs) {
            const option = element('option', packDisplayName(entry.pack.id, entry.pack.name));
            option.value = entry.pack.id;
            destination.append(option);
        }
        destination.value = packId;
        packLabel.append(destination);
        form.append(packLabel);
        const latex = input(form, t('LaTeX 模板'), initial?.latex ?? '', true) as HTMLTextAreaElement;
        latex.id = 'formula-latex';
        latex.spellcheck = false;
        form.append(element('p', t('将光标放在 LaTeX 中需要填参的位置，再“添加参数并插入槽位”。分组花括号与参数槽位由预览检查。'), 'settings-note'));
        const rows = element('div', '', 'parameter-editor');
        form.append(rows);
        const wrapLabel = element('label', t('包裹目标'));
        const wrap = element('select');
        wrap.setAttribute('aria-label', t('包裹目标'));
        wrapLabel.append(wrap);
        form.append(wrapLabel);
        const preferLabel = element('label', t('优先使用显式选区'));
        const prefer = element('input');
        prefer.type = 'checkbox';
        prefer.checked = initial?.preferSelection !== false;
        prefer.setAttribute('aria-label', t('优先使用显式选区'));
        preferLabel.prepend(prefer);
        form.append(preferLabel);
        const preview = element('div', '', 'formula-preview');
        preview.id = 'formula-live-preview';
        form.append(preview);
        const read = (): Snippet => ({ id, name: name.value, command: command.value, aliases: aliases.value.split(/[,，\s]+/).filter(Boolean), description: description.value, latex: latex.value, parameters: structuredClone(parameters), ...(wrap.value ? { wrapTarget: wrap.value, preferSelection: prefer.checked } : {}) });
        const validated = (): Snippet => { const snippet = read(); const pack = validatePack({ ...this.pack(destination.value), snippets: [snippet] }); checkPackMath(pack); return pack.snippets[0]; };
        const showPreview = () => { try {
            const snippet = read();
            if(!snippet.latex.trim()){preview.textContent=t('输入 LaTeX 后将在此显示数学预览');return;}
            const checked=validatePack({...this.pack(destination.value),snippets:[{...snippet,name:snippet.name||t('预览'),command:snippet.command||'preview'}]});
            checkPackMath(checked);
            renderMathPreview(preview, renderSnippet(snippet));
            preview.classList.remove('error');
        }
        catch (error) {
            preview.textContent = String(error);
            preview.classList.add('error');
        } };
        let wrapValue = initial?.wrapTarget ?? '';
        const associatedIds = new Map(parameters.map(parameter => [parameter, parameter.id]));
        const renderWrap = () => { wrap.replaceChildren(); const none = element('option', t('不启用智能包裹')); none.value = ''; wrap.append(none); for (const parameter of parameters) {
            const option = element('option', `${parameter.name} (${parameter.id})`);
            option.value = parameter.id;
            wrap.append(option);
        } wrap.value = wrapValue; };
        const renderParameters = () => {
            rows.replaceChildren();
            parameters.forEach((parameter, index) => {
                const row = element('fieldset');
                const field = `${t('参数')} ${index + 1}`;
                row.append(element('legend', field));
                const pid = input(row, `${field} ID`, parameter.id);
                pid.addEventListener('change', () => { const previous = associatedIds.get(parameter) ?? parameter.id; parameter.id = pid.value; if (/^[a-z][a-z0-9_]{0,31}$/.test(pid.value) && !parameters.some(other => other !== parameter && other.id === pid.value)) {
                    latex.value = latex.value.replaceAll(`{{${previous}}}`, `{{${pid.value}}}`);
                    associatedIds.set(parameter, pid.value);
                    if (wrapValue === previous)
                        wrapValue = pid.value;
                } renderWrap(); showPreview(); });
                const pname = input(row, `${field} ${tr('名称', 'name')}`, parameter.name);
                pname.addEventListener('input', () => { parameter.name = pname.value; renderWrap(); });
                const def = input(row, `${field} ${tr('默认值', 'default value')}`, parameter.defaultValue);
                def.addEventListener('input', () => { parameter.defaultValue = def.value; showPreview(); });
                const desc = input(row, `${field} ${tr('说明', 'description')}`, parameter.description);
                desc.addEventListener('input', () => { parameter.description = desc.value; });
                const up = button(t('上移'), () => { [parameters[index - 1], parameters[index]] = [parameters[index], parameters[index - 1]]; renderParameters(); }, tr(`上移参数 ${index + 1}`, `Move parameter ${index + 1} up`));
                up.disabled = index === 0;
                const down = button(t('下移'), () => { [parameters[index + 1], parameters[index]] = [parameters[index], parameters[index + 1]]; renderParameters(); }, tr(`下移参数 ${index + 1}`, `Move parameter ${index + 1} down`));
                down.disabled = index === parameters.length - 1;
                row.append(up, down, button(t('移除参数'), () => { const associated = associatedIds.get(parameter) ?? parameter.id; latex.value = latex.value.replaceAll(`{{${associated}}}`, parameter.defaultValue); parameters.splice(index, 1); if (wrapValue === associated)
                    wrapValue = ''; renderParameters(); showPreview(); }, tr(`移除参数 ${index + 1}`, `Remove parameter ${index + 1}`)));
                rows.append(row);
            });
            renderWrap();
        };
        wrap.addEventListener('change', () => { wrapValue = wrap.value; });
        renderParameters();
        form.append(button(t('添加参数并插入槽位'), () => {
            let n = 1;
            while (parameters.some(parameter => parameter.id === `param${n}`))
                n++;
            const pid = `param${n}`, start = latex.selectionStart, end = latex.selectionEnd;
            parameters.push({ id: pid, name: `${t('参数')} ${parameters.length + 1}`, description: '', defaultValue: latex.value.slice(start, end) || 'x' });
            latex.setRangeText(`{{${pid}}}`, start, end, 'end');
            renderParameters();
            showPreview();
            latex.focus();
        }));
        form.addEventListener('input', showPreview);
        showPreview();
        const testArea = element('section', '', 'template-test');
        testArea.id = 'formula-test-area';
        body.append(testArea);
        form.append(button(t('测试公式'), () => { try {
            this.testFormula(validated(), destination.value, testArea);
        }
        catch (error) {
            this.showError(error);
        } }));
        const save = element('button', t('保存公式'), 'primary');
        save.type = 'submit';
        form.append(button(t('取消编辑'), () => this.render()), save);
        form.addEventListener('submit', event => {
            event.preventDefault();
            try {
                const snippet = validated();
                const target = destination.value;
                void this.perform(() => this.service.mutate(state => {
                    const from = state.packs.find(entry => entry.pack.id === packId);
                    const to = state.packs.find(entry => entry.pack.id === target);
                    if (!to)
                        throw new Error(t('所属包不存在'));
                    if (editingId && from)
                        from.pack.snippets = from.pack.snippets.filter(item => item.id !== editingId);
                    if (to.pack.snippets.some(item => item.id === snippet.id))
                        throw new Error(t('目标包存在同 ID 的公式'));
                    to.pack.snippets.push(snippet);
                    this.selected = target;
                    return state;
                }));
            }
            catch (error) {
                this.showError(error);
            }
        });
    }
    private testFormula(snippet: Snippet, packId: string, area: HTMLElement): void {
        this.disposePlayground();
        area.replaceChildren(element('h3', t('独立测试区')), element('p', t('Tab 切换参数 · Enter 结束当前模板 · Ctrl Space 选择嵌套模板；此处不会提交到外部应用。')));
        const output = element('code');
        output.id = 'formula-test-output';
        const tooltip = new ParameterTooltip();
        tooltip.element.id = 'formula-test-parameter-tooltip';
        let mounted = false;
        const editor = new MathEditor({ change: () => { if (this.playground && mounted) {
                output.textContent = this.playground.latex;
                tooltip.render(this.playground.placeholders.stack);
                this.playgroundPopup?.render(this.playground.completion.state);
            } }, submit: () => { output.textContent = editor.latex; }, cancel: () => { editor.closeCompletion(); }, error: error => this.showError(error) });
        editor.field.id = 'formula-test-field';
        editor.field.setAttribute('aria-label', t('模板测试编辑器'));
        const candidate = { ...snippet, packId, packName: this.pack(packId).name };
        editor.registry.replace([...this.service.snippets().filter(item => snippetKey(item) !== snippetKey(candidate)), candidate]);
        editor.completion.aliases = this.aliases();
        this.playground = editor;
        this.playgroundPopup = new CompletionPopup((item, wrap) => editor.accept(item, wrap), editor.field, 'formula-test-popup');
        editor.field.setAttribute('aria-controls', 'formula-test-popup');
        editor.field.addEventListener('selection-change', () => { const selected = editor.completion.selected; if (selected)
            editor.field.setAttribute('aria-activedescendant', candidateId(selected, 'formula-test-popup')); });
        editor.field.addEventListener('mount', () => { mounted = true; editor.field.menuItems = []; editor.accept(candidate); editor.focus(); }, { once: true });
        area.append(editor.field, tooltip.element, output, button(t('重新插入模板'), () => { editor.setLatex(''); editor.accept(candidate); }), button(t('包裹 A+B'), () => { editor.setLatex('A+B'); editor.field.select(); editor.accept(candidate, true); }));
        area.scrollIntoView({ block: 'nearest' });
    }
}
