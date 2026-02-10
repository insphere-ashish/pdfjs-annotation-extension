import './scss/app.scss'

import { EventBus, PDFPageView, PDFViewerApplication } from 'pdfjs'
import { createRef } from 'react'
import { createRoot } from 'react-dom/client'
import { initializeI18n } from './locale/index'
import { SyncOutlined } from '@ant-design/icons';
import i18n, { t } from 'i18next'
import { CustomPopbar, CustomPopbarRef } from './components/popbar'
import { CustomToolbar, CustomToolbarRef } from './components/toolbar'
import { annotationDefinitions, HASH_PARAMS_DEFAULT_EDITOR_ACTIVE, HASH_PARAMS_DEFAULT_SIDEBAR_OPEN, HASH_PARAMS_GET_URL, HASH_PARAMS_POST_URL, HASH_PARAMS_USERNAME } from './const/definitions'
import { Painter } from './painter'
import { CustomComment, CustomCommentRef } from './components/comment'
import { once, parseQueryString, hashArrayOfObjects } from './utils/utils'
import { defaultOptions } from './const/default_options'
import { exportAnnotationsToExcel, exportAnnotationsToPdf, printAnnotationsToPdf } from './annot'
import { Modal, Space, message } from 'antd'
import { CustomAnnotationMenu, CustomAnnotationMenuRef } from './components/menu'
import { ConnectorLine } from './painter/connectorLine'

interface AppOptions {
    [key: string]: string;
}

const shouldSaveNow = (a: IAnnotationStore) => {
    if ( a?.type == 11 || a?.type == 5) {
        const txt = a?.contentsObj?.text ?? '';
        return txt.trim().length > 0;
    }
    return true;
};

// changing it to include both note and square box annotations
const isNoteAnnotation = (a: IAnnotationStore) => {
    return a?.type == 11 || a?.type == 5
};

const isOnlyNoteAnnotation = (a: IAnnotationStore) => {
    return a?.type == 11
}

class PdfjsAnnotationExtension {
    PDFJS_PDFViewerApplication: PDFViewerApplication // PDF.js 的 PDFViewerApplication 对象
    PDFJS_EventBus: EventBus // PDF.js 的 EventBus 对象
    $PDFJS_outerContainer: HTMLDivElement
    $PDFJS_mainContainer: HTMLDivElement
    $PDFJS_sidebarContainer: HTMLDivElement // PDF.js 侧边栏容器
    $PDFJS_toolbar_container: HTMLDivElement // PDF.js 工具栏容器
    $PDFJS_viewerContainer: HTMLDivElement // PDF.js 页面视图容器
    customToolbarRef: React.RefObject<CustomToolbarRef> // 自定义工具栏的引用
    customPopbarRef: React.RefObject<CustomPopbarRef>
    customerAnnotationMenuRef: React.RefObject<CustomAnnotationMenuRef> // 自定义批注菜单的引用
    customCommentRef: React.RefObject<CustomCommentRef>
    painter: Painter // 画笔实例
    appOptions: AppOptions
    loadEnd: Boolean
    initialDataHash: number
    _connectorLine: ConnectorLine | null = null
    isCommentEditing: boolean = false // Track if comment is being edited
    isHighlighting: boolean = false

    /**
     * @description Handle comment editing state change
     */
    private handleCommentEditingStateChange = (isEditing: boolean) => {
        this.isCommentEditing = isEditing
        this.updateToolbar() // Re-render toolbar with new disabled state
    }

    constructor() {
        this.loadEnd = false
        this.initialDataHash = null
        // 初始化 PDF.js 对象和相关属性
        this.PDFJS_PDFViewerApplication = (window as any).PDFViewerApplication
        this.PDFJS_EventBus = this.PDFJS_PDFViewerApplication.eventBus
        this.$PDFJS_sidebarContainer = this.PDFJS_PDFViewerApplication.appConfig.sidebar.sidebarContainer
        this.$PDFJS_toolbar_container = this.PDFJS_PDFViewerApplication.appConfig.toolbar.container
        this.$PDFJS_viewerContainer = this.PDFJS_PDFViewerApplication.appConfig.viewerContainer
        this.$PDFJS_mainContainer = this.PDFJS_PDFViewerApplication.appConfig.mainContainer
        this.$PDFJS_outerContainer = this.PDFJS_PDFViewerApplication.appConfig.sidebar.outerContainer
        // 使用 createRef 方法创建 React 引用
        this.customToolbarRef = createRef<CustomToolbarRef>()
        this.customPopbarRef = createRef<CustomPopbarRef>()
        this.customerAnnotationMenuRef = createRef<CustomAnnotationMenuRef>()
        this.customCommentRef = createRef<CustomCommentRef>()
        // 加载多语言
        initializeI18n(this.PDFJS_PDFViewerApplication.l10n.getLanguage())
        this.appOptions = {
            [HASH_PARAMS_USERNAME]: i18n.t('normal.unknownUser'), // 默认用户名,
            [HASH_PARAMS_GET_URL]: defaultOptions.setting.HASH_PARAMS_GET_URL, // 默认 GET URL
            [HASH_PARAMS_POST_URL]: defaultOptions.setting.HASH_PARAMS_POST_URL, // 默认 POST URL
            [HASH_PARAMS_DEFAULT_EDITOR_ACTIVE]: defaultOptions.setting.HASH_PARAMS_DEFAULT_EDITOR_ACTIVE,
            [HASH_PARAMS_DEFAULT_SIDEBAR_OPEN]: defaultOptions.setting.HASH_PARAMS_DEFAULT_SIDEBAR_OPEN,
        };

        // 处理地址栏参数
        this.parseHashParams()

        const container = document.getElementById('docViewerContainer');

        // custom code for e-court
        this.appOptions[HASH_PARAMS_USERNAME] = container ? container?.dataset['userName'] : ''
        // this.appOptions[HASH_PARAMS_GET_URL] = container ? container?.dataset['annoGet'] : ''
        // this.appOptions[HASH_PARAMS_POST_URL] = container ? container?.dataset['annoPost'] : ''

        // 创建画笔实例
        this.painter = new Painter({
            userName: this.getOption(HASH_PARAMS_USERNAME),
            PDFViewerApplication: this.PDFJS_PDFViewerApplication,
            PDFJS_EventBus: this.PDFJS_EventBus,
            setDefaultMode: () => {
                this.customToolbarRef.current.activeAnnotation(annotationDefinitions[0])
            },
            onWebSelectionSelected: range => {
                // this.customPopbarRef.current.open(range) // custom code -- commented customPopbar for e-court
            },
            onStoreAdd: (annotation, isOriginal, currentAnnotation) => {
                this.customCommentRef.current.addAnnotation(annotation)
                if (isOriginal) return;
                // custom code -- e-court auto open comment sidebar if note type
                if (isNoteAnnotation(annotation)) {
                    this.toggleComment(true)
                }
                if (shouldSaveNow(annotation)) {
                    this.saveData() // -----------------------------------------    custom code -- e-court auto save after modified
                }
                // console.log('%c [ add annotation onStoreAdd ]', 'font-size:13px; background:#d10d00; color:#ff8989;', annotation)
                if (currentAnnotation.isOnce) {
                    this.painter.selectAnnotation(annotation.id)
                }
                if (this.isCommentOpen()) {
                    // 如果评论栏已打开，则选中批注
                    this.customCommentRef.current.selectedAnnotation(annotation, true)
                }
            },
            onStoreDelete: (id) => {
                this.customCommentRef.current.delAnnotation(id)
                this.saveData() // -----------------------------------------    custom code -- e-court auto save after modified
            },
            onAnnotationSelected: (annotation, isClick, selectorRect) => {
                if (isNoteAnnotation(annotation)) {
                    this.toggleComment(true)
                    this.jsAnnoComment(true)
                }
                if(!annotation?.sharedToUser){
                    this.customerAnnotationMenuRef.current.open(annotation, selectorRect)
                }
                if (isClick && (this.isCommentOpen() || isNoteAnnotation(annotation))) {
                    // 如果是点击事件并且评论栏已打开，则选中批注
                    this.customCommentRef.current.selectedAnnotation(annotation, isClick) // custom code -- e-court
                }

                this.connectorLine?.drawConnection(annotation, selectorRect)
            },
            onAnnotationChange: (annotation) => {
                if (annotation) {
                    this.customCommentRef.current.updateAnnotation(annotation)
                }
            },
            onAnnotationChanging: () => {
                this.connectorLine?.clearConnection()
                this.customerAnnotationMenuRef?.current?.close()
            },
            onAnnotationChanged: (annotation, selectorRect) => {
                // console.log('annotation changed', annotation)
                // this.connectorLine?.drawConnection(annotation, selectorRect) // custom code -- e-court removing the connection line after modified
                if(!annotation?.sharedToUser){
                    this.customerAnnotationMenuRef?.current?.open(annotation, selectorRect)
                }
                if (shouldSaveNow(annotation)) {
                    this.saveData() // custom code -- e-court auto save after modified
                }
            },
        })
        // 初始化操作
        this.init()
    }

    get connectorLine(): ConnectorLine | null {
        if (defaultOptions.connectorLine.ENABLED) {
            this._connectorLine = new ConnectorLine({})
        }
        return this._connectorLine
    }

    /**
     * @description 初始化 PdfjsAnnotationExtension 类
     */
    private init(): void {
        this.addCustomStyle()
        this.bindPdfjsEvents()
        this.renderToolbar()
        this.renderPopBar()
        this.renderAnnotationMenu()
        this.renderComment()
        this.setupShareModal()
    }

    /**
     * @description 处理地址栏参数
     * @returns 
     */
    private parseHashParams() {
        const hash = document.location.hash.substring(1);
        if (!hash) {
            console.warn(`HASH_PARAMS is undefined`);
            return;
        }
        const params = parseQueryString(hash);
        if (params.has(HASH_PARAMS_USERNAME)) {
            this.setOption(HASH_PARAMS_USERNAME, params.get(HASH_PARAMS_USERNAME))
        } else {
            console.warn(`${HASH_PARAMS_USERNAME} is undefined`);
        }
        if (params.has(HASH_PARAMS_GET_URL)) {
            this.setOption(HASH_PARAMS_GET_URL, params.get(HASH_PARAMS_GET_URL))
        } else {
            console.warn(`${HASH_PARAMS_GET_URL} is undefined`);
        }
        if (params.has(HASH_PARAMS_POST_URL)) {
            this.setOption(HASH_PARAMS_POST_URL, params.get(HASH_PARAMS_POST_URL))
        } else {
            console.warn(`${HASH_PARAMS_POST_URL} is undefined`);
        }
        if (params.has(HASH_PARAMS_DEFAULT_EDITOR_ACTIVE) && params.get(HASH_PARAMS_DEFAULT_EDITOR_ACTIVE) === 'true') {
            this.setOption(HASH_PARAMS_DEFAULT_EDITOR_ACTIVE, 'select')
        } else {
            console.warn(`${HASH_PARAMS_DEFAULT_EDITOR_ACTIVE} is undefined`);
        }

        if (params.has(HASH_PARAMS_DEFAULT_SIDEBAR_OPEN) && params.get(HASH_PARAMS_DEFAULT_SIDEBAR_OPEN) === 'false') {
            this.setOption(HASH_PARAMS_DEFAULT_SIDEBAR_OPEN, 'false')
        } else {
            console.warn(`${HASH_PARAMS_DEFAULT_EDITOR_ACTIVE} is undefined`);
        }

    }

    private setOption(name: string, value: string) {
        this.appOptions[name] = value
    }

    private getOption(name: string) {
        return this.appOptions[name]
    }

    /**
     * @description 添加自定义样式
     */
    private addCustomStyle(): void {
        document.body.classList.add('PdfjsAnnotationExtension')
        this.toggleComment(this.getOption(HASH_PARAMS_DEFAULT_SIDEBAR_OPEN) === 'true')
    }

    /**
     * @description 切换评论栏的显示状态
     * @param open 
     */
    private toggleComment(open: boolean): void {
        if (open) {
            document.body.classList.remove('PdfjsAnnotationExtension_Comment_hidden')
        } else {
            document.body.classList.add('PdfjsAnnotationExtension_Comment_hidden')
        }
    }

    private jsAnnoComment(open: boolean): void {
        if (open) {
            this.customToolbarRef.current.toggleSidebarBtn(true)
        } else {
            this.customToolbarRef.current.toggleSidebarBtn(false)
        }
    }

    /**
     * @description 检查评论栏是否打开
     * @returns 
     */
    private isCommentOpen(): boolean {
        return !document.body.classList.contains('PdfjsAnnotationExtension_Comment_hidden')
    }

    private toolbarRoot: any = null // Store the root for re-rendering

    /**
     * @description 渲染自定义工具栏
     */
    private renderToolbar(): void {
        const toolbar = document.createElement('div')
        this.$PDFJS_toolbar_container.insertAdjacentElement('afterend', toolbar)
        this.toolbarRoot = createRoot(toolbar)
        this.updateToolbar()
    }

    /**
     * @description 更新工具栏状态
     */
    private updateToolbar(): void {
        if (!this.toolbarRoot) return
        
        this.toolbarRoot.render(
            <CustomToolbar
                ref={this.customToolbarRef}
                defaultAnnotationName={this.getOption(HASH_PARAMS_DEFAULT_EDITOR_ACTIVE)}
                defaultSidebarOpen={this.getOption(HASH_PARAMS_DEFAULT_SIDEBAR_OPEN) === 'true'}
                userName={this.getOption(HASH_PARAMS_USERNAME)}
                disabled={this.isCommentEditing}
                onChange={(currentAnnotation, dataTransfer) => {
                    this.painter.activate(currentAnnotation, dataTransfer)
                }}
                onSave={() => {
                    this.saveData()
                }}
                onExport={async (type) => {
                    if (type === 'excel') {
                        this.exportExcel()
                        return
                    }
                    if (type === 'pdf') {
                        await this.exportPdf()
                        return
                    }
                    if (type === 'print') {
                        await this.printPdf()
                        return
                    }
                }}
                onSidebarOpen={(isOpen) => {
                    this.toggleComment(isOpen)
                    this.connectorLine.clearConnection()
                }}
            />
        )
    }

    /**
     * @description 渲染自定义弹出工具条
     */
    private renderPopBar(): void {
        const popbar = document.createElement('div')
        this.$PDFJS_viewerContainer.insertAdjacentElement('afterend', popbar)
        createRoot(popbar).render(
            <CustomPopbar
                ref={this.customPopbarRef}
                onChange={(currentAnnotation, range) => {
                    this.painter.highlightRange(range, currentAnnotation)
                }}
            />
        )
    }

    /**
     * @description 渲染自定义弹出工具条
     */
    private renderAnnotationMenu(): void {
        const annotationMenu = document.createElement('div')
        this.$PDFJS_outerContainer.insertAdjacentElement('afterend', annotationMenu)
        createRoot(annotationMenu).render(
            <CustomAnnotationMenu
                ref={this.customerAnnotationMenuRef}
                onOpenComment={(currentAnnotation) => {
                    this.toggleComment(true)
                    this.customToolbarRef.current.toggleSidebarBtn(true)
                    setTimeout(() => {
                        this.customCommentRef.current.selectedAnnotation(currentAnnotation, true)
                    }, 100)
                }}
                onChangeStyle={(currentAnnotation, style) => {
                    this.painter.updateAnnotationStyle(currentAnnotation, style)
                    this.customToolbarRef.current.updateStyle(currentAnnotation.type, style)
                    this.saveData() // custom code - auto save for note type for e-court
                }}
                onDelete={(currentAnnotation) => {
                    this.painter.delete(currentAnnotation.id, true)
                }}
            />
        )
    }

    /**
     * @description 渲染自定义留言条
     */
    private renderComment(): void {
        const comment = document.createElement('div')
        this.$PDFJS_mainContainer.insertAdjacentElement('afterend', comment)
        createRoot(comment).render(
            <CustomComment
                ref={this.customCommentRef}
                customToolbarRef={this.customToolbarRef}
                toggleComment={this.toggleComment.bind(this)}
                userName={this.getOption(HASH_PARAMS_USERNAME)}
                onSelected={async (annotation) => {
                    this.isHighlighting = true
                    await this.painter.highlight(annotation, () => {
                        setTimeout(() => {
                            this.isHighlighting = false
                        }, 500)
                    })
                }}
                onDelete={(id) => {
                    this.painter.delete(id)
                    this.saveData() // custom code - auto save for note type for e-court 
                }}
                onUpdate={(annotation) => {
                    this.painter.update(annotation.id, {
                        title: annotation.title,
                        contentsObj: annotation.contentsObj,
                        comments: annotation.comments
                    })
                    if ([11,5].includes(annotation.type)) {
                        this.saveData() // custom code - auto save for note type for e-court 
                    }
                }}
                onScroll={() => {
                    this.connectorLine?.clearConnection()
                }}
                onShareClick={(annotation) => {
                    this.getShareModal(annotation)
                }}
                onEditingStateChange={this.handleCommentEditingStateChange}
            />
        )
    }

    /**
     * @description 隐藏 PDF.js 编辑模式按钮
     */
    private hidePdfjsEditorModeButtons(): void {
        defaultOptions.setting.HIDE_PDFJS_ELEMENT.forEach(item => {
            const element = document.querySelector(item) as HTMLElement;
            if (element) {
                element.style.display = 'none';
                const nextDiv = element.nextElementSibling as HTMLElement;
                if (nextDiv.classList.contains('horizontalToolbarSeparator')) {
                    nextDiv.style.display = 'none'
                }
            }
        });
    }

    private updatePdfjs() {
        const currentScaleValue = this.PDFJS_PDFViewerApplication.pdfViewer.currentScaleValue
        if (
            currentScaleValue === 'auto' ||
            currentScaleValue === 'page-fit' ||
            currentScaleValue === 'page-width'
        ) {
            this.PDFJS_PDFViewerApplication.pdfViewer.currentScaleValue = '0.8'
            this.PDFJS_PDFViewerApplication.pdfViewer.update()
        } else {
            this.PDFJS_PDFViewerApplication.pdfViewer.currentScaleValue = 'auto'
            this.PDFJS_PDFViewerApplication.pdfViewer.update()
        }
        this.PDFJS_PDFViewerApplication.pdfViewer.currentScaleValue = currentScaleValue
        this.PDFJS_PDFViewerApplication.pdfViewer.update()
    }

    private clearInitialDataHash(){
        this.initialDataHash = null
    }

    /**
     * @description Show session expired popup
     * @param message - The message to display
     */
    private showSessionExpiredPopup(message: string): void {
        if (typeof (window as any).showSessionExpiredPopup === 'function') {
            (window as any).showSessionExpiredPopup(message)
        } else {
            Modal.error({
                content: message,
                closable: false,
                okButtonProps: {
                    loading: false
                },
                okText: t('normal.ok'),
                onOk: () => {
                    // Optionally reload or redirect to login
                    window.location.reload()
                }
            })
        }
    }

    /**
     * @description 获取当前可见的页码
     * @returns 页码数组
     */
    private getVisiblePages(): number[] {
        const visiblePages: number[] = []
        const pdfViewer = this.PDFJS_PDFViewerApplication.pdfViewer
        
        if (!pdfViewer || !pdfViewer._pages) {
            return visiblePages
        }

        // 获取所有页面
        for (let i = 0; i < pdfViewer._pages.length; i++) {
            const pageView = pdfViewer._pages[i]
            if (pageView && pageView.div) {
                // 检查页面是否在视口中
                const rect = pageView.div.getBoundingClientRect()
                const isVisible = (
                    rect.top < window.innerHeight &&
                    rect.bottom > 0 &&
                    rect.left < window.innerWidth &&
                    rect.right > 0
                )
                if (isVisible) {
                    visiblePages.push(pageView.id)
                }
            }
        }

        // 如果没有找到可见页面，至少返回当前页
        if (visiblePages.length === 0 && pdfViewer.currentPageNumber) {
            visiblePages.push(pdfViewer.currentPageNumber)
        }

        return visiblePages
    }

    /**
     * @description 绑定 PDF.js 相关事件
     */
    private bindPdfjsEvents(): void {
        this.hidePdfjsEditorModeButtons()
        const setLoadEnd = once(() => {
            this.loadEnd = true
        })

        // 视图更新时隐藏菜单
        this.PDFJS_EventBus._on('updateviewarea', () => {
            this.customerAnnotationMenuRef.current?.close()
            if (!this.isHighlighting) {
                this.connectorLine?.clearConnection()
            }
        })

        // 监听页面渲染完成事件
        this.PDFJS_EventBus._on(
            'pagerendered',
            async ({ source, cssTransform, pageNumber }: { source: PDFPageView; cssTransform: boolean; pageNumber: number }) => {
                setLoadEnd()
                // console.log('pagerendered', pageNumber)
                // console.log('pageView source', source)
                this.painter.initCanvas({ pageView: source, cssTransform, pageNumber })
                
                // 延迟加载该页面的注释
                if (this.loadEnd && !this.painter.isPageLoaded(pageNumber)) {
                    const pageAnnotations = await this.getPageAnnotations(pageNumber)
                    if (pageAnnotations.length > 0) {
                        await this.painter.loadPageAnnotations(pageNumber, pageAnnotations)
                        // 通知评论组件更新
                        pageAnnotations.forEach(annotation => {
                            this.customCommentRef.current?.addAnnotation(annotation)
                        })
                    }
                }
            }
        )

        // 监听文档加载完成事件
        this.PDFJS_EventBus._on('documentloaded', async () => {
            // alert('sssssss')
            this.customCommentRef.current?.clear?.(); // custom code -- clear all existing annotations when a new document is loaded
            this.clearInitialDataHash(); // custom code -- clear all existing annotations when a new document is loaded
            this.painter.clearData();// custom code -- clear all existing annotations when a new document is loaded
            this.painter.initWebSelection(this.$PDFJS_viewerContainer)
            
            // 首先加载评论类型的批注（类型 5 和 11）
            const commentAnnotations = await this.getCommentAnnotations()
            if (commentAnnotations.length > 0) {
                await this.painter.initAnnotations(commentAnnotations, false)
                commentAnnotations.forEach(annotation => {
                    this.customCommentRef.current?.addAnnotation(annotation)
                })
            }
            
            // 然后加载其他可见页面的批注
            const data = await this.getData()
            this.initialDataHash = hashArrayOfObjects([...commentAnnotations, ...data])
            // console.log('%c [ initialDataHash - data ]', 'font-size:13px; background:#d10d00; color:#ff5144;', data) 
            await this.painter.initAnnotations(data, defaultOptions.setting.LOAD_PDF_ANNOTATION)
            if (this.loadEnd) {
                this.updatePdfjs()
            }
        })
    }

    /**
     * @description 获取评论类型的批注数据（类型 5 和 11）
     * @returns 
     */
    private async getCommentAnnotations(): Promise<any[]> {
        const getUrl = document.getElementById('docViewerContainer')?.dataset['annoGet'];
        if (!getUrl) {
            return [];
        }
        try {
            const separator = getUrl.includes('?') ? '&' : '?'
            const fetchUrl = `${getUrl}${separator}type=comments`
            
            const response = await fetch(fetchUrl, { method: 'GET' });

            if (response.status === 401) {
                this.showSessionExpiredPopup('Your session has expired. Please log in again.');
                return [];
            }

            if (!response.ok) {
                const errorMessage = `HTTP Error ${response.status}: ${response.statusText || 'Unknown Status'}`;
                throw new Error(errorMessage);
            }
            return await response.json();
        } catch (error) {
            console.error('Fetch error for comment annotations:', error);
            return [];
        }
    }

    /**
     * @description 获取指定页面的批注数据
     * @param pageNumber - 页码
     * @returns 
     */
    private async getPageAnnotations(pageNumber: number): Promise<any[]> {
        const getUrl = document.getElementById('docViewerContainer')?.dataset['annoGet'];
        if (!getUrl) {
            return [];
        }
        try {
            const separator = getUrl.includes('?') ? '&' : '?'
            const fetchUrl = `${getUrl}${separator}pages=${pageNumber}`
            
            const response = await fetch(fetchUrl, { method: 'GET' });

            if (response.status === 401) {
                this.showSessionExpiredPopup('Your session has expired. Please log in again.');
                return [];
            }

            if (!response.ok) {
                const errorMessage = `HTTP Error ${response.status}: ${response.statusText || 'Unknown Status'}`;
                throw new Error(errorMessage);
            }
            return await response.json();
        } catch (error) {
            console.error('Fetch error for page', pageNumber, ':', error);
            return [];
        }
    }

    /**
     * @description 获取外部批注数据
     * @returns 
     */
    private async getData(): Promise<any[]> {
        // const getUrl = this.getOption(HASH_PARAMS_GET_URL);
        const getUrl = document.getElementById('docViewerContainer').dataset['annoGet'];
        // alert('getUrl', getUrl)
        // console.log('--------------------------------- this.appOptions', this.appOptions)
        // console.log('--------------------------------- defaultOptions', defaultOptions)
        // console.log('--------------------------------- %c [ getUrl ]', 'font-size:13px; background:#d10d00; color:#ff5144;', getUrl)
        if (!getUrl) {
            return [];
        }
        try {
            message.open({
                type: 'loading',
                content: t('normal.processing'),
                duration: 0,
            });

            // 获取可见页面
            const visiblePages = this.getVisiblePages()
            
            // 构建带页码参数的URL
            let fetchUrl = getUrl
            if (visiblePages.length > 0) {
                const separator = getUrl.includes('?') ? '&' : '?'
                fetchUrl = `${getUrl}${separator}pages=${visiblePages.join(',')}`
            }

            const response = await fetch(fetchUrl, {
                method: 'GET',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                credentials: 'same-origin'
            });

            if (response.status === 401) {
                this.showSessionExpiredPopup('Your session has expired. Please log in again.');
                return [];
            }

            if (!response.ok) {
                const errorMessage = `HTTP Error ${response.status}: ${response.statusText || 'Unknown Status'}`;
                throw new Error(errorMessage);
            }
            return await response.json();
        } catch (error) {
            Modal.error({
                content: t('load.fail', { value: error?.message }),
                closable: false,
                okButtonProps: {
                    loading: false
                },
                okText: t('normal.ok')
            })
            console.error('Fetch error:', error);
            return [];
        } finally {
            message.destroy();
        }
    }

    /**
     * @description 保存批注数据
     * @returns 
     */
    private async saveData(): Promise<void> {
        // 获取变更的注释而不是所有注释
        const changedAnnotations = this.painter.getChangedAnnotations();
        
        console.log('[saveData] Changed annotations to save:', changedAnnotations)
        
        // 如果没有变更，不需要保存
        if (changedAnnotations.length === 0) {
            console.log('[saveData] No changes to save');
            return;
        }

        // console.log('%c [ changedAnnotations ]', 'font-size:13px; background:#d10d00; color:#ff5144;', changedAnnotations)
        // const postUrl = this.getOption(HASH_PARAMS_POST_URL);
        const postUrl = document.getElementById('docViewerContainer').dataset['annoPost'];
        if (!postUrl) {
            message.error({
                content: t('save.noPostUrl', { value: HASH_PARAMS_POST_URL }),
                key: 'save',
            });
            return;
        }
        // const modal = Modal.info({
        //     content: <Space><SyncOutlined spin />{t('save.start')}</Space>,
        //     closable: false,
        //     okButtonProps: {
        //         loading: true
        //     },
        //     okText: t('normal.ok')
        // })
        try {
            const response = await fetch(postUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify(changedAnnotations),
            });
            
            if (response.status === 401) {
                this.showSessionExpiredPopup('Your session has expired. Please log in again.');
                return;
            }
            
            if (!response.ok) {
                throw new Error(`Failed to save PDF. Status: ${response.status} ${response.statusText}`);
            }
            const result = await response.json();
            // {"status": "ok", "message": "POST received!"}
            
            // 保存成功后清除变更跟踪
            this.painter.clearChangeTracking()
            this.initialDataHash = hashArrayOfObjects(this.painter.getData())
            
            // modal.destroy()
            // Check if the operation was a deletion
            const hasDeleted = changedAnnotations.some(ann => ann._changeType === 'deleted');
            const successMessage = hasDeleted ? 'Deleted successfully' : t('save.success');
            // message.success({
            //     content: t('save.success'),
            //     key: 'save',
            // });
            (window as any).CustomMessage.success(successMessage,2);
            // console.log('Saved successfully:', result);
        } catch (error) {
            // const modal = Modal.info({
            //     content: <Space><SyncOutlined spin />{t('save.start')}</Space>,
            //     closable: false,
            //     okButtonProps: {
            //         loading: true
            //     },
            //     okText: t('normal.ok')
            // })
            // modal.update({
            const modal = Modal.info({
                type: 'error',
                content: t('save.fail', { value: error?.message }),
                closable: true,
                okButtonProps: {
                    loading: false
                },
            })
            console.error('Error while saving data:', error);
        }
    }

    private async exportPdf() {
        const dataToSave = this.painter.getData();
        const modal = Modal.info({
            title: t('normal.export'),
            content: <Space><SyncOutlined spin />{t('normal.processing')}</Space>,
            closable: false,
            okButtonProps: {
                loading: true
            },
            okText: t('normal.ok')
        })
        await exportAnnotationsToPdf(this.PDFJS_PDFViewerApplication, dataToSave)
        modal.update({
            type: 'success',
            title: t('normal.export'),
            content: t('pdf.generationSuccess'),
            closable: true,
            okButtonProps: {
                loading: false
            },
        })
    }

    private async printPdf() {
        const dataToSave = this.painter.getData();
        const modal = Modal.info({
            title: t('normal.print'),
            content: <Space><SyncOutlined spin />{t('normal.processing')}</Space>,
            closable: false,
            okButtonProps: {
                loading: true
            },
            okText: t('normal.ok')
        })
        await printAnnotationsToPdf(this.PDFJS_PDFViewerApplication, dataToSave)
        modal.destroy()
    }

    private async exportExcel() {
        const annotations = this.painter.getData()
        await exportAnnotationsToExcel(this.PDFJS_PDFViewerApplication, annotations)
        Modal.info({
            type: 'success',
            title: t('normal.export'),
            content: t('pdf.generationSuccess'),
            closable: true,
            okButtonProps: {
                loading: false
            },
        })
    }

    public hasUnsavedChanges(): boolean {
        return hashArrayOfObjects(this.painter.getData()) !== this.initialDataHash
    }

    public removeSharedComment(id: string): void {
        this.painter.delete(id, false)
        this.customCommentRef.current?.delAnnotation(id)
    }

    /** START - share model setup  */
    private shareModalInstance: any = null;
    private currentShareAnnotation: IAnnotationStore | null = null;
    private unshareUserIds: Set<string> = new Set(); // track users to be unshared

    private setupShareModal = (): void => {
        var container = document.getElementById('docViewerContainer');
        if (!container) return;

        var modalEl = container.querySelector('#shareCommentModal') as HTMLElement | null;
        if (!modalEl) return;

        // Bootstrap modal instance (don’t show yet)
        // @ts-ignore
        this.shareModalInstance = bootstrap.Modal.getOrCreateInstance(modalEl, { backdrop: 'static', keyboard: false });

        // ADD user button
        var addBtn = document.getElementById('add-share-user-btn');
        if (addBtn) {
            addBtn.addEventListener('click', this.handleAddShareUser);
        }

        // SAVE button
        var saveBtn = document.getElementById('save-shared-comment-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', this.handleShareSave);
        }

        // Delegate remove + per-row frequency change on the list container
        var listContainer = document.getElementById('shared-users-list');
        if (listContainer) {
            listContainer.addEventListener('click', this.handleListClicks);
            listContainer.addEventListener('change', this.handleListChange);
        }
    }

    private chosenRefresh = (modelContainer): void => {
        modelContainer.querySelectorAll('.chzn-select').forEach((elem) => {
            const $elem = $(elem);
            if ($elem.data('chosen')) {
                $elem.trigger('chosen:updated');
            } else {
                $elem.chosen({disable_search: true});
            }
        });
    }

    // Build one "shared user" row using your exact HTML (with tiny IDs/classes adjustments)
    private renderSharedUserRow(user: { id: string|number; email: string; roleCode?: string; }, frequencyValue: string): string {
        var roleTag = (user.roleCode || '').toUpperCase().slice(0, 3) || '';
        // Selected option markup
        var sel = function (v: string) { return v === frequencyValue ? ' selected' : '' };

        return (
            `<div class="userlist c-form u-fieldHeight48" ` +
            `data-user-id="` + String(user.id) + `" ` +
            `data-email="` + (user.email || ``) + `" ` +
            `data-role="` + (user.roleCode || ``) + `">` +
            `  <div class="username"><strong>` + roleTag + `</strong> ` + (user.email || ``) + `</div>` +
            `  <div class="action set-frequencylist">` +
            `    <div class="cop-form--container set-frequencydropdown ">` +
            `      <div class="dropdowns-customized chosen fs14__regular u-fieldHeight38">` +
            `        <select class="frequency-select-row chzn-select" aria-label="Set Frequency" title="Set Frequency">` +
            // `          <option value="">Set Frequency</option>` +
            `          <option value="0"` + sel(`0`) + `>Permanently</option>` +
            `          <option value="1"` + sel(`1`) + `>1 Week</option>` +
            `          <option value="2"` + sel(`2`) + `>15 Days</option>` +
            `          <option value="3"` + sel(`3`) + `>1 Month</option>` +
            `        </select>` +
            `      </div>` +
            `    </div>` +
            `    <a href="javascript:;" class="remove-shared-user" aria-label="Remove User">` +
            `      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">` +
            `        <path d="M16.8887 8.88892C16.8887 13.3072 13.307 16.8889 8.88867 16.8889C4.4704 16.8889 0.888672 13.3072 0.888672 8.88892C0.888672 4.47064 4.4704 0.888916 8.88867 0.888916C13.307 0.888916 16.8887 4.47064 16.8887 8.88892Z" stroke="#FF0000" stroke-width="1.77778"/>` +
            `        <path d="M6.22266 8.88892H11.556" stroke="#FF0000" stroke-width="1.77778" stroke-linecap="round" stroke-linejoin="round"/>` +
            `      </svg>` +
            `    </a>` +
            `  </div>` +
            `</div>`
        );
    }

    private clearSharedList(): void {
        var list = document.getElementById('shared-users-list');
        if (list) list.innerHTML = 'Comment is not shared with any user.';
    }

    private renderSharedUsersList(sharedUsers: Array<{ id: string|number; email: string; roleCode?: string; frequency?: string }>): void {
        var list = document.getElementById('shared-users-list');
        if (!list) return;

        if (!sharedUsers || !sharedUsers.length) {
            list.innerHTML = 'Comment is not shared with any user.';
            return;
        }

        var html = '';
        for (var i = 0; i < sharedUsers.length; i++) {
            var su = sharedUsers[i];
            html += this.renderSharedUserRow(
            { id: su.id, email: su.email, roleCode: su.roleCode },
            (su.frequency == null ? '' : String(su.frequency))
            );
        }
        list.innerHTML = html;
    }
    
    // populate a new user row
    private populateUserSelect(allUsers: Array<{ id: string|number; email: string; roleCode?: string }>, excludeIds?: Set<string>): void {
        var select = document.getElementById('user-select') as HTMLSelectElement | null;
        if (!select) return;

        select.innerHTML = ''; // reset

        for (var i = 0; i < (allUsers || []).length; i++) {
            var u = allUsers[i];
            var userId = String(u.id);
            
            // Skip users that are already shared (in excludeIds)
            if (excludeIds && excludeIds.has(userId)) {
                continue;
            }
            
            var opt = document.createElement('option');
            opt.value = userId;
            opt.textContent = (u.email || '');
            opt.setAttribute('data-strong-text', (u.roleCode || '').toUpperCase());
            select.appendChild(opt);
        }

        // Initialize/refresh SumoSelect (if you use it)
        // @ts-ignore
        if (window.$ && (window as any).jQuery) {
            // @ts-ignore
            var $sel = (window as any).jQuery(select);
            // @ts-ignore
            if (!$sel[0]?.sumo) {
            // @ts-ignore
            $sel.SumoSelect({ okCancelInMulti: true, selectAll: true, search: true });
            } else {
            // @ts-ignore
            $sel[0].sumo.reload();
            }
        }
    }

    private setDocumentHeader(docName: string, pageNumber: string | number, commentText: string): void {
        var modelContainer = document.getElementById('shareCommentModal');
        var docEl = modelContainer.querySelector('#documentName');
        var pageEl = modelContainer.querySelector('#pageNumberLabel');
        var commentEl = modelContainer.querySelector('#share-comment-text');
        if (docEl) docEl.textContent = docName || '';
        if (pageEl) pageEl.textContent = String(pageNumber || '');
        if (commentEl) commentEl.textContent = commentText || '';
    }

    // Helper to get currently shared user IDs from the list
    private getSharedUserIds(): Set<string> {
        var list = document.getElementById('shared-users-list');
        var sharedIds = new Set<string>();
        if (!list) return sharedIds;

        list.querySelectorAll('.userlist[data-user-id]').forEach((el) => {
            var id = (el as HTMLElement).getAttribute('data-user-id') || '';
            if (id) sharedIds.add(id);
        });
        return sharedIds;
    }

    // Refresh the user dropdown to exclude already shared users
    private refreshUserDropdown(): void {
        var modelContainer = document.getElementById('shareCommentModal');
        if (!modelContainer) return;

        var userSelect = modelContainer.querySelector('#user-select') as HTMLSelectElement | null;
        if (!userSelect) return;

        // Store original data attributes for all options
        if (!userSelect.hasAttribute('data-all-users')) {
            var allUsersData: Array<{ id: string; email: string; roleCode: string }> = [];
            Array.from(userSelect.options).forEach((opt) => {
                allUsersData.push({
                    id: opt.value,
                    email: opt.textContent || '',
                    roleCode: opt.getAttribute('data-strong-text') || ''
                });
            });
            userSelect.setAttribute('data-all-users', JSON.stringify(allUsersData));
        }

        // Get all users and currently shared IDs
        var allUsersJson = userSelect.getAttribute('data-all-users') || '[]';
        var allUsers = JSON.parse(allUsersJson);
        var sharedIds = this.getSharedUserIds();

        // Re-populate with filtering
        this.populateUserSelect(allUsers, sharedIds);

        // Re-initialize SumoSelect strong text display
        this.initializeSumoSelectWithRoles(modelContainer);
    }

    // Initialize SumoSelect with role code display
    private initializeSumoSelectWithRoles(modelContainer: HTMLElement): void {
        modelContainer.querySelectorAll('.testSelAll').forEach((elem) => {
            if (!elem.classList.contains('sumoInitialized')) {
                // @ts-ignore
                $(elem).SumoSelect({ okCancelInMulti: true, selectAll: true, search: true });
                elem.classList.add('sumoInitialized');
            }

            // Add strong text in options for role code
            // @ts-ignore
            $(elem).find('option').each(function(index) {
                // @ts-ignore
                const strongText = $(this).attr('data-strong-text');
                if (strongText) {
                    // @ts-ignore
                    const li = $('.testSelAll')[0].sumo.ul.find('li').eq(index);
                    const label = li.find('label');
                    if(label.length && !label.hasClass('roleCodeAdded')){
                        const originalText = label.text();
                        label.html('<strong>' + strongText + '</strong> ' + originalText);
                        label.addClass('roleCodeAdded');
                    }
                }
            });
        });
    }

    // Handle Add User button click
    private handleAddShareUser = (ev: Event) => {
        ev.preventDefault();
        var modelContainer = document.getElementById('shareCommentModal');
        var userSelect = modelContainer.querySelector('#user-select') as HTMLSelectElement | null;
        var freqSelect = modelContainer.querySelector('#frequency-select') as HTMLSelectElement | null;
        var list = modelContainer.querySelector('#shared-users-list');
        if (!userSelect || !freqSelect || !list) return;

        var frequencyValue = freqSelect.value || '';
        if (!frequencyValue) {
            // You can toast here if frequency is required before adding
            // message.warning('Please choose frequency');
        }

        // Build a set of existing IDs to prevent duplicates
        var existingIds: Record<string, boolean> = {};
        list.querySelectorAll('.userlist[data-user-id]').forEach(function (el) {
            var id = (el as HTMLElement).getAttribute('data-user-id') || '';
            if (id) existingIds[id] = true;
        });

        // If list currently contains the “empty” message, clear it
        if (list.textContent && list.textContent.trim().startsWith('Comment is not shared')) {
            list.innerHTML = '';
        }

        // Add selected users
        var added = 0;
        Array.from(userSelect.selectedOptions).forEach((opt) => {
            var id = opt.value;
            var email = opt.textContent || '';
            var roleCode = opt.getAttribute('data-strong-text') || '';
            if (existingIds[id]) return;

            // Remove from unshare list if user is being re-added
            if (this.unshareUserIds.has(id)) {
                this.unshareUserIds.delete(id);
            }

            var rowHtml = this.renderSharedUserRow({ 
                id: id, 
                email: email, 
                roleCode: roleCode 
            }, frequencyValue);
            // list.insertAdjacentHTML('beforeend', rowHtml); // append at end
            list.insertAdjacentHTML('afterbegin', rowHtml); // append at start
            existingIds[id] = true;
            added++;
        });

        // Optional: clear selection after adding
        // for (var i = 0; i < userSelect.options.length; i++) userSelect.options[i].selected = false;
        if(added > 0){
            this.chosenRefresh(modelContainer);
            // Refresh dropdown to hide newly added users
            this.refreshUserDropdown();
        }
    };

    // handeler for remove and per -row frequency change
    private handleListClicks = (ev: Event) => {
        var target = ev.target as HTMLElement;
        if (!target) return;
        var modelContainer = document.getElementById('shareCommentModal');

        // Clicks on the red delete icon (anchor or its children)
        var removeAnchor = target.closest && target.closest('.remove-shared-user');
        if (removeAnchor) {
            ev.preventDefault();
            var row = (removeAnchor as HTMLElement).closest('.userlist') as HTMLElement | null;
            if (!row) return;

            // Track user for unsharing
            var userId = row.getAttribute('data-user-id') || '';
            if (userId) {
                this.unshareUserIds.add(userId);
            }

            row.remove();

            // If no rows left, restore the “empty” message
            var list = modelContainer.querySelector('#shared-users-list');
            if (list && !list.querySelector('.userlist')) {
                list.innerHTML = 'Comment is not shared with any user.';
            }

            // Refresh dropdown to show the removed user again
            this.refreshUserDropdown();
        }
    };

    private handleListChange = (ev: Event) => {
        var target = ev.target as HTMLSelectElement;
        if (!target) return;

        if (target.classList.contains('frequency-select-row')) {
            // You can validate / normalize here if needed
            // var newVal = target.value;
        }
    };

    private getShareModal = (annotation: IAnnotationStore): void => {
        var container = document.getElementById('docViewerContainer');
        if (!container) return;
        var modelContainer = document.getElementById('shareCommentModal');

        var url = container.dataset['shareUrl'];             // /comment/share
        var caseGuid = container.dataset['caseGuid'];
        var fileuuid = container.dataset['currentFileuuid'];

        if (!url || !caseGuid || !fileuuid) {
            console.warn('Required dataset missing.');
            return;
        }

        this.currentShareAnnotation = annotation;
        this.unshareUserIds = new Set(); // reset unshare tracking

        var postData = {
            action: 'fetch',
            caseGuid: caseGuid,
            fileuuid: fileuuid,
            pageNumber: annotation.pageNumber,
            commentId: annotation.id 
        };

        var saveBtn = modelContainer.querySelector('#save-shared-comment-btn') as HTMLButtonElement | null;
        if (saveBtn) saveBtn.disabled = true;

        message.open({
            type: 'loading',
            content: t('normal.processing'),
            duration: 0,
        });

        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(postData)
        })
        .then(function (response) { return response.json(); })
        .then((resp) => {
            if (!resp || resp.result !== 'success') {
                throw new Error(resp?.error || 'Failed to load share data.');
            }

            // 1) Header fields
            this.setDocumentHeader(resp.doc_name || '', resp.pageNumber || '', resp.comment_text || '');

            // 2) Populate #user-select
            // resp.users should be an array of { id, email, roleCode? }
            var allUsers = (resp.users || []).map(function (u: any) {
                return { 
                    id: u.id,
                    email: u.email || '',
                    roleCode: u.roleCode || '' 
                };
            });

            // 3) Pre-populate already shared users (if backend sends them later, we’ll use resp.shared_users)
            this.renderSharedUsersList(resp.shared_users || []); // if None, it shows the default empty text

            // 4) Populate user dropdown with filtering (store all users and filter out shared ones)
            var userSelect = modelContainer.querySelector('#user-select') as HTMLSelectElement | null;
            if (userSelect) {
                userSelect.setAttribute('data-all-users', JSON.stringify(allUsers));
            }
            this.refreshUserDropdown();

            if (saveBtn) saveBtn.disabled = false;

            // -----------------------------------------------------------------------------------------
            var modalContainer = document.getElementById('docViewerContainer').querySelector('#shareCommentModal');
            var showModelEvent = (event) => {
                // modalContainer.querySelectorAll('.testSelAll').forEach((elem) => $(elem).SumoSelect({okCancelInMulti:true, selectAll:true,  search: true }));
                modalContainer.querySelectorAll('.testSelAll').forEach((elem) => {
                    if (!elem.classList.contains('sumoInitialized')) {
                        $(elem).SumoSelect({ okCancelInMulti: true, selectAll: true, search: true });
                        elem.classList.add('sumoInitialized');
                    }

                    // to add strong text in options for role code 
                    $(elem).find('option').each(function(index) {
                        const strongText = $(this).attr('data-strong-text');
                        if (strongText) {
                            const li = $('.testSelAll')[0].sumo.ul.find('li').eq(index);
                            const label = li.find('label');
                            if(label.length && !label.hasClass('roleCodeAdded')){
                                const originalText = label.text();
                                label.html('<strong>' + strongText + '</strong> ' + originalText);
                                label.addClass('roleCodeAdded');
                            }
                        }
                    });
                });
                this.chosenRefresh(modalContainer);
            }

            $(modalContainer).off('show.bs.modal').on('show.bs.modal', showModelEvent);     
            // -----------------------------------------------------------------------------------------

            // show modal only after populate
            this.shareModalInstance && this.shareModalInstance.show();
        })
        // .catch(function (error) {
        //     Modal.error({
        //         content: 'Error: ' + (error?.message || 'Unknown'),
        //         closable: true
        //     });
        // })
        .finally(function () {
            message.destroy();
        });
    }

    // handle share save 
    private handleShareSave = (ev?: Event) => {
        if (ev) ev.preventDefault();

        var container = document.getElementById('docViewerContainer');
        if (!container || !this.currentShareAnnotation) return;

        var url = container.dataset['shareUrl']; // same endpoint
        var caseGuid = container.dataset['caseGuid'];
        var fileuuid = container.dataset['currentFileuuid'];

        if (!url || !caseGuid || !fileuuid) return;

        // Gather rows for users to share
        var list = document.getElementById('shared-users-list');
        if (!list) return;

        var rows = Array.from(list.querySelectorAll('.userlist[data-user-id]'));
        var items: Array<{ userId: string; frequency: string }> = [];
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i] as HTMLElement;
            var userId = row.getAttribute('data-user-id') || '';
            if (!userId) continue;
            var freqSel = row.querySelector('.frequency-select-row') as HTMLSelectElement | null;
            var frequency = (freqSel && freqSel.value) ? freqSel.value : '';
            if (userId) {
                items.push({ userId: userId, frequency: frequency });
            }
        }

        // Get users to unshare (filter out any that are in items list)
        var itemUserIds = new Set(items.map(item => item.userId));
        var unshareUsers = Array.from(this.unshareUserIds).filter(id => !itemUserIds.has(id));

        // Must have at least one action (share or unshare)
        if (items.length === 0 && unshareUsers.length === 0) {
            message.warning(t('comment.share.noUsers'));
            return;
        }

        var payload = {
            action: 'save',
            caseGuid: caseGuid,
            fileuuid: fileuuid,
            pageNumber: this.currentShareAnnotation.pageNumber,
            commentId: this.currentShareAnnotation.id, // IMPORTANT: backend expects commentId
            items: items,
            unshare_users: unshareUsers
        };

        var saveBtn = document.getElementById('save-shared-comment-btn') as HTMLButtonElement | null;
        if (saveBtn) saveBtn.disabled = true;
        message.open({ type: 'loading', content: t('normal.processing'), duration: 0 });

        fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(function (response) { return response.json(); })
        .then((resp) => {
            if (!resp || resp.result !== 'success') {
                throw new Error(resp?.error || 'Save failed.');
            }
            // message.success(t('save.success'),{duration: 2});
            (window as any).CustomMessage.success(t('save.success'),2);
            this.shareModalInstance && this.shareModalInstance.hide();
        })
        // .catch(function (error) {
        //     Modal.error({
        //         content: 'Save error: ' + (error?.message || 'Unknown'),
        //         closable: true
        //     });
        // })
        .finally(function () {
            if (saveBtn) saveBtn.disabled = false;
            message.destroy();
        });
    };

    



    // private async getShareModal(annotation: IAnnotationStore): Promise<any[]> {
    //     // const getUrl = this.getOption(HASH_PARAMS_GET_URL);
    //     const getUrl = document.getElementById('docViewerContainer').dataset['shareUrl'];
    //     const caseGuid = document.getElementById('docViewerContainer').dataset['caseGuid'];
    //     const currentFileuuid = document.getElementById('docViewerContainer').dataset['currentFileuuid'];
    //     // alert('getUrl', getUrl)
    //     // console.log('--------------------------------- this.appOptions', this.appOptions)
    //     // console.log('--------------------------------- defaultOptions', defaultOptions)
    //     // console.log('--------------------------------- %c [ getUrl ]', 'font-size:13px; background:#d10d00; color:#ff5144;', getUrl)
    //     if (!getUrl || !caseGuid || !currentFileuuid) {
    //         console.warn('Some required data is undefined');
    //         return [];
    //     }
    //     try {
    //         message.open({
    //             type: 'loading',
    //             content: t('normal.processing'),
    //             duration: 0,
    //         });

    //         const postData = {
    //             caseGuid: caseGuid,
    //             fileuuid: currentFileuuid,
    //             pageNumber: annotation.pageNumber,
    //             internalId: annotation.id,
    //             comment: annotation.contentsObj?.text || ''
    //         };

    //         // fetch(actionUrl, requestOptions)
    //         // .then( response => { return response.json()})
    //         // .then( resp => {
    //         // if(resp.result == 'error'){
    //         //     let redirectTimeout = 0;
    //         //     if(resp.message){
    //         //     CustomMessage.error(resp.message);
    //         //     redirectTimeout = 600
    //         //     }
    //         //     if(resp.redirect){
    //         //     setTimeout(() => {
    //         //         window.location.href = resp.redirect;
    //         //     }, redirectTimeout);
    //         //     }
    //         // }
            
    //         fetch(getUrl, { 
    //             method: 'POST',
    //             headers: { 'Content-Type': 'application/json' },
    //             body: JSON.stringify(postData)
    //         })
    //         .then(response => {return response.json()})
    //         .then(response => {
    //             if(!response || response == ''){
    //                 return;
    //             }
    //             if(resp.result == 'error'){
    //                 return;
    //             }
    //             if(resp.result == 'success'){
    //                 // shareCommentModal
    //                 // share-comment-modal-body
    //                 // document.getElementById('docViewerContainer').querySelector('#share-comment-modal-body').innerHTML = html;
    
    //                 var modalContainer = document.getElementById('docViewerContainer').querySelector('#shareCommentModal');
    //                 const shareModal = new bootstrap.Modal(modalContainer, {});
    
    //                 var showModelEvent = function (event) {
    //                     // modalContainer.querySelectorAll('.testSelAll').forEach((elem) => $(elem).SumoSelect({okCancelInMulti:true, selectAll:true,  search: true }));
    //                     modalContainer.querySelectorAll('.testSelAll').forEach((elem) => {
    //                         if (!elem.classList.contains('sumoInitialized')) {
    //                             $(elem).SumoSelect({ okCancelInMulti: true, selectAll: true, search: true });
    //                             elem.classList.add('sumoInitialized');
    //                         }
    //                     });
    //                     modalContainer.querySelectorAll('.bootstrap-select').forEach((elem) => {
    //                         if (!$(elem).data('selectpicker')) {
    //                             $(elem).selectpicker();
    //                         } else {
    //                             $(elem).selectpicker('render');
    //                         }
    //                     });
    //                 }
      
    //                 $(modalContainer).off('show.bs.modal').on('show.bs.modal', showModelEvent);              
    //                 shareModal.show();

    //             }
    //         })

    //         // if (!response.ok) {
    //         //     const errorMessage = `HTTP Error ${response.status}: ${response.statusText || 'Unknown Status'}`;
    //         //     throw new Error(errorMessage);
    //         // }
    //         // dataJson = response.json();
    //         // if
    //         // this.container.querySelector('#view-judgement-modal-body').innerHTML = html;
    //         // const viewJudgementModal = new bootstrap.Modal(this.container.querySelector('#judgementViewModal'), {});
    //     } catch (error) {
    //         Modal.error({
    //             content: t('load.fail', { value: error?.message }),
    //             closable: false,
    //             okButtonProps: {
    //                 loading: false
    //             },
    //             okText: t('normal.ok')
    //         })
    //         // console.error('Fetch error:', error);
    //         return [];
    //     } finally {
    //         message.destroy();
    //     }
    // }
    /** END  - share model setup  */

}

declare global {
    interface Window {
        pdfjsAnnotationExtensionInstance: PdfjsAnnotationExtension
    }
}

window.pdfjsAnnotationExtensionInstance = new PdfjsAnnotationExtension()