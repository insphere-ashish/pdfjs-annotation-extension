import { PDFDocument, PDFName, PDFPage } from 'pdf-lib'
import { PDFViewerApplication } from 'pdfjs'
import { annotationDefinitions, CommentStatus, IAnnotationStore, PdfjsAnnotationType } from '../const/definitions'
import { TextParser } from './parse_text'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { AnnotationParser } from './parse'
import { HighlightParser } from './parse_highlight'
import { UnderlineParser } from './parse_underline'
import { StrikeOutParser } from './parse_strikeout'
import { SquareParser } from './parse_square'
import { CircleParser } from './parse_circle'
import { InkParser } from './parse_ink'
import { formatPDFDate, getPDFDateTimestamp, getTimestampString } from '../utils/utils'
import { FreeTextParser } from './parse_freetext'
import { StampParser } from './parse_stamp'
import { LineParser } from './parse_line'
import { PolylineParser } from './parse_polyline'
import { t } from 'i18next'

// Flatten parsers for print mode (draws directly on page)
import { SquareFlattenParser } from './parse_square_flatten'
import { CircleFlattenParser } from './parse_circle_flatten'
import { HighlightFlattenParser } from './parse_highlight_flatten'
import { UnderlineFlattenParser } from './parse_underline_flatten'
import { StrikeOutFlattenParser } from './parse_strikeout_flatten'
import { TextFlattenParser } from './parse_text_flatten'
import { InkFlattenParser } from './parse_ink_flatten'
import { LineFlattenParser } from './parse_line_flatten'
import { FreeTextFlattenParser } from './parse_freetext_flatten'
import { StampFlattenParser } from './parse_stamp_flatten'
import { PolylineFlattenParser } from './parse_polyline_flatten'

// import { HighlightParser } from './parse_highlight' // future
// import { InkParser } from './parse_ink' // future

// 映射不同批注类型到对应的解析器类 (for export PDF with annotation objects)
const parserMap: {
    [key: number]: new (pdfDoc: PDFDocument, page: PDFPage, ann: IAnnotationStore) => AnnotationParser
} = {
    [PdfjsAnnotationType.TEXT]: TextParser,
    [PdfjsAnnotationType.HIGHLIGHT]: HighlightParser,
    [PdfjsAnnotationType.UNDERLINE]: UnderlineParser,
    [PdfjsAnnotationType.STRIKEOUT]: StrikeOutParser,
    [PdfjsAnnotationType.SQUARE]: SquareParser,
    [PdfjsAnnotationType.CIRCLE]: CircleParser,
    [PdfjsAnnotationType.INK]: InkParser,
    [PdfjsAnnotationType.POLYLINE]: PolylineParser,
    [PdfjsAnnotationType.FREETEXT]: FreeTextParser,
    [PdfjsAnnotationType.STAMP]: StampParser,
    [PdfjsAnnotationType.LINE]: LineParser
    // 你可以在这里扩展其他类型的解析器
}

// Flatten parser map for print mode (draws directly, no annotation objects)
const flattenParserMap: {
    [key: number]: new (pdfDoc: PDFDocument, page: PDFPage, ann: IAnnotationStore) => AnnotationParser
} = {
    [PdfjsAnnotationType.TEXT]: TextFlattenParser,
    [PdfjsAnnotationType.HIGHLIGHT]: HighlightFlattenParser,
    [PdfjsAnnotationType.UNDERLINE]: UnderlineFlattenParser,
    [PdfjsAnnotationType.STRIKEOUT]: StrikeOutFlattenParser,
    [PdfjsAnnotationType.SQUARE]: SquareFlattenParser,
    [PdfjsAnnotationType.CIRCLE]: CircleFlattenParser,
    [PdfjsAnnotationType.INK]: InkFlattenParser,
    [PdfjsAnnotationType.POLYLINE]: PolylineFlattenParser,
    [PdfjsAnnotationType.FREETEXT]: FreeTextFlattenParser,
    [PdfjsAnnotationType.STAMP]: StampFlattenParser,
    [PdfjsAnnotationType.LINE]: LineFlattenParser
}

/**
 * 将单个注解对象解析并添加到指定 PDF 页面中。
 *
 * @param annotation - 批注数据对象（IAnnotationStore 格式）
 * @param page - 要添加注解的 PDF 页面
 * @param pdfDoc - 当前正在编辑的 PDF 文档实例
 * @param useFlattenMode - 是否使用flatten模式（直接绘制在页面上，用于打印）
 */
async function parseAnnotationToPdf(annotation: IAnnotationStore, page: PDFPage, pdfDoc: PDFDocument, useFlattenMode: boolean = false): Promise<void> {
    const parserMapToUse = useFlattenMode ? flattenParserMap : parserMap
    const ParserClass = parserMapToUse[annotation.pdfjsType]
    if (ParserClass) {
        const parser = new ParserClass(pdfDoc, page, annotation)
        await parser.parse()
    } else {
        console.warn('Unsupported annotation type:', annotation.pdfjsType)
    }
}

/**
 * 触发 PDF 下载
 *
 * @param data - 保存后的 PDF 数据（Uint8Array）
 * @param filename - 下载时使用的文件名
 */
function downloadPdf(data: Uint8Array, filename: string) {
    // 提取安全的 ArrayBuffer
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    // 创建 Blob
    // @ts-ignore
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
    // 使用 saveAs 下载
    saveAs(blob, `${filename}.pdf`)
}

/**
 * 触发 PDF 打印
 *
 * @param data - 保存后的 PDF 数据（Uint8Array）
 * @param filename - 打印窗口标题使用的文件名
 */
function printPdf(data: Uint8Array, filename: string) {
    // 提取安全的 ArrayBuffer
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    // 创建 Blob
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' })
    // 创建 Blob URL
    const blobUrl = URL.createObjectURL(blob)
    
    // Open PDF in new window for printing (more reliable than iframe)
    const printWindow = window.open(blobUrl, '_blank')
    
    if (printWindow) {
        // Wait for PDF to load in new window, then trigger print
        printWindow.addEventListener('load', () => {
            setTimeout(() => {
                printWindow.print()
                // Clean up after a delay
                setTimeout(() => {
                    URL.revokeObjectURL(blobUrl)
                }, 1000)
            }, 500)
        })
    } else {
        // Fallback: if popup blocked, use iframe method
        const existingFrame = document.querySelector("#pdf-print-frame") as HTMLIFrameElement;
        if(existingFrame){
            existingFrame.remove();
        }
        
        const printFrame = document.createElement('iframe')
        printFrame.style.position = 'fixed'
        printFrame.style.right = '0'
        printFrame.style.bottom = '0'
        printFrame.style.width = '0'
        printFrame.style.height = '0'
        printFrame.style.border = '0'
        printFrame.id = 'pdf-print-frame'
        document.body.appendChild(printFrame)
        
        printFrame.onload = () => {
            try {
                setTimeout(() => {
                    if (printFrame.contentWindow) {
                        printFrame.contentWindow.focus()
                        printFrame.contentWindow.print()
                    }
                    
                    setTimeout(() => {
                        if (document.body.contains(printFrame)) {
                            document.body.removeChild(printFrame)
                        }
                        URL.revokeObjectURL(blobUrl)
                    }, 1000)
                }, 500)
            } catch (error) {
                console.error('Print failed:', error)
                if (document.body.contains(printFrame)) {
                    document.body.removeChild(printFrame)
                }
                URL.revokeObjectURL(blobUrl)
            }
        }
        
        printFrame.src = blobUrl
    }
}

function downloadExcel(data: any, filename: string) {
    const buffer = new Blob([data], { type: 'application/octet-stream' })
    saveAs(buffer, `${filename}.xlsx`)
}

/**
 * 从 PDF 中清除所有页面上的原始注解（Annots）
 *
 * @param pdfDoc - 要处理的 PDF 文档对象
 */
function clearAllAnnotations(pdfDoc: PDFDocument) {
    for (const page of pdfDoc.getPages()) {
        const annotsKey = PDFName.of('Annots')
        if (page.node.has(annotsKey)) {
            page.node.set(annotsKey, pdfDoc.context.obj([])) // 清空批注数组
        }
    }
}

// 动态加载字体文件，返回 ArrayBuffer
async function loadFontBuffer(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to load font at ${url}`)
    return await response.arrayBuffer()
}

/**
 * 主导函数：加载 PDF，插入所有注解，然后触发下载。
 *
 * @param url - 要加载的 PDF 文件 URL
 * @param annotations - 解析后的批注数据数组
 */
async function exportAnnotationsToPdf(PDFViewerApplication: PDFViewerApplication, annotations: IAnnotationStore[]) {
    // 加载 PDF 文件为 pdf-lib 可识别的文档对象
    const pdfData = await PDFViewerApplication.pdfDocument.getData();
    const pdfDoc = await PDFDocument.load(pdfData);

    // ✅ 清除原有的所有批注
    clearAllAnnotations(pdfDoc)
    // 遍历每一个注解并解析应用到对应页面
    for (const ann of annotations) {
        const page = pdfDoc.getPages()[ann.pageNumber - 1]
        await parseAnnotationToPdf(ann, page, pdfDoc)
    }

    // 保存带注解的 PDF
    const modifiedPdf = await pdfDoc.save()
    // 使用 title + 时间戳作为文件名
    const baseName = PDFViewerApplication._title || 'annotated'
    const fileName = `${baseName}_${getTimestampString()}`

    downloadPdf(modifiedPdf, fileName)
}

/**
 * 主导函数：加载 PDF，插入所有注解，然后触发打印。
 * 使用 FLATTEN 模式 - 直接绘制到页面内容上，确保打印时可见
 *
 * @param PDFViewerApplication - PDF.js 应用实例
 * @param annotations - 解析后的批注数据数组
 */
async function printAnnotationsToPdf(PDFViewerApplication: PDFViewerApplication, annotations: IAnnotationStore[]) {
    // 加载 PDF 文件为 pdf-lib 可识别的文档对象
    const pdfData = await PDFViewerApplication.pdfDocument.getData();
    const pdfDoc = await PDFDocument.load(pdfData);

    // ✅ 清除原有的所有批注
    clearAllAnnotations(pdfDoc)
    // 遍历每一个注解并解析应用到对应页面 - 使用 FLATTEN 模式
    for (const ann of annotations) {
        const page = pdfDoc.getPages()[ann.pageNumber - 1]
        await parseAnnotationToPdf(ann, page, pdfDoc, true) // TRUE = flatten mode for printing
    }

    // 保存带注解的 PDF
    const modifiedPdf = await pdfDoc.save()
    // 使用 title + 时间戳作为文件名
    const baseName = PDFViewerApplication._title || 'annotated'
    const fileName = `${baseName}_${getTimestampString()}`

    printPdf(modifiedPdf, fileName)
}

async function exportAnnotationsToExcel(PDFViewerApplication: PDFViewerApplication, annotations: IAnnotationStore[]) {
    const rows: any[] = []
    // 先按页码升序，再按批注时间降序
    annotations.sort((a, b) => {
        if (a.pageNumber !== b.pageNumber) {
            return a.pageNumber - b.pageNumber
        }
        return getPDFDateTimestamp(b.date) - getPDFDateTimestamp(a.date)
    })
    const getLastStatusName = (annotation: IAnnotationStore): string => {
        const lastWithStatus = [...(annotation.comments || [])].reverse().find(c => c.status !== undefined && c.status !== null)

        const status = lastWithStatus?.status ?? CommentStatus.None
        return t(`comment.status.${status.toLowerCase()}`)
    }

    let mainIndex = 1 // 主批注序号
    let replyCounter: number = 0 // 回复计数器（每次主批注开始重置）

    annotations.forEach(annotation => {
        const annotationName = annotationDefinitions.find(def => def.type === annotation.type)?.name
        const typeLabel = t(`annotations.${annotationName}`)
        // 主批注行
        rows.push({
            index: `${mainIndex}`,
            id: annotation.id,
            page: annotation.pageNumber,
            annotationType: typeLabel,
            recordType: t('export.recordType.annotation'),
            author: annotation.title,
            content: annotation.contentsObj?.text || '',
            date: formatPDFDate(annotation.date, true),
            status: getLastStatusName(annotation)
        })
        // 重置回复计数器
        replyCounter = 0
        // 回复行
        annotation.comments.forEach(comment => {
            replyCounter++
            rows.push({
                index: `${mainIndex}.${replyCounter}`,
                id: comment.id,
                page: '',
                annotationType: '--',
                recordType: t('export.recordType.reply'),
                author: comment.title,
                content: comment.content,
                date: formatPDFDate(comment.date, true),
                status: ''
            })
        })
        mainIndex++
    })

    // 创建 workbook 和 sheet
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet(t('export.sheetName'))

    // 自定义列宽（单位为字符宽度）
    sheet.columns = [
        {
            key: 'index',
            header: '#',
            width: 8,
            style: {
                alignment: { vertical: 'middle' }
            }
        },
        {
            key: 'id',
            header: t('export.fields.id'),
            width: 20,
            style: {
                alignment: {
                    vertical: 'middle'
                }
            }
        },
        {
            key: 'page',
            header: t('export.fields.page'),
            width: 10,
            style: {
                alignment: {
                    vertical: 'middle'
                }
            }
        },
        {
            key: 'annotationType',
            header: t('export.fields.annotationType'),
            width: 18,
            style: {
                alignment: {
                    vertical: 'middle'
                }
            }
        },
        {
            key: 'recordType',
            header: t('export.fields.recordType'),
            width: 12,
            style: {
                alignment: {
                    vertical: 'middle'
                }
            }
        },
        {
            key: 'author',
            header: t('export.fields.author'),
            width: 16,
            style: {
                alignment: {
                    vertical: 'middle'
                }
            }
        },
        {
            key: 'content',
            header: t('export.fields.content'),
            width: 40,
            style: {
                alignment: {
                    wrapText: true,
                    vertical: 'top'
                }
            }
        },
        {
            key: 'date',
            header: t('export.fields.date'),
            width: 22,
            style: {
                alignment: {
                    vertical: 'middle'
                }
            }
        },
        {
            key: 'status',
            header: t('export.fields.status'),
            width: 14,
            style: {
                alignment: {
                    vertical: 'middle'
                }
            }
        }
    ]

    // 写入数据 + 样式
    rows.forEach(row => {
        const addedRow = sheet.addRow(row)
        const isReply = row.recordType === t('export.recordType.reply')
        addedRow.font = {
            size: 12,
            color: { argb: isReply ? '389e0d' : '000000' }
        }
    })

    // 表头样式
    sheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true, size: 12 }
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'D9E1F2' }
        }
    })

    // 写入数据后给所有单元格加边框
    sheet.eachRow(row => {
        row.eachCell(cell => {
            cell.border = {
                top: { style: 'thin', color: { argb: '000000' } },
                left: { style: 'thin', color: { argb: '000000' } },
                bottom: { style: 'thin', color: { argb: '000000' } },
                right: { style: 'thin', color: { argb: '000000' } }
            }
        })
    })

    // 导出
    const buffer = await workbook.xlsx.writeBuffer()
    const baseName = PDFViewerApplication._title || 'annotated'
    const fileName = `${baseName}_${getTimestampString()}`
    downloadExcel(buffer, fileName)
}

export { exportAnnotationsToPdf, printAnnotationsToPdf, exportAnnotationsToExcel }
