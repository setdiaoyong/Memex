import initBatch from 'src/util/promise-batcher'
import { updatePageSearchIndex } from 'src/search/find-pages'
import importHistory, { getHistoryEstimates } from './import-history'
import processImportDoc from './import-doc-processor'
import {
    lastImportTimeStorageKey, importProgressStorageKey,
    setImportDocStatus, getImportDocs,
} from './'
import { CMDS, IMPORT_DOC_STATUS, IMPORT_CONN_NAME } from 'src/options/imports/constants'


// Local storage helpers to make the main functions a bit less messy
const getLastImportTime = async () =>
    (await browser.storage.local.get(lastImportTimeStorageKey))[lastImportTimeStorageKey]
const setLastImportTime = async () =>
    (await browser.storage.local.set({ [lastImportTimeStorageKey]: Date.now() }))
const getImportInProgressFlag = async () =>
    (await browser.storage.local.get(importProgressStorageKey))[importProgressStorageKey]
const setImportInProgressFlag = async () =>
    (await browser.storage.local.set({ [importProgressStorageKey]: true }))
const clearImportInProgressFlag = async () =>
    await browser.storage.local.remove(importProgressStorageKey)

/**
 * Creates observer functions to afford sending of messages over connection port
 * to UI on certain batcher events. Note that next (success) and error handlers are pretty
 * much the same; they either contain error or output/status keys, which UI handles if present.
 *
 * @param {Port} port The open connection port to send messages over.
 */
const getBatchObserver = port => {
    const handleFinishedItem = docStatus => ({ input: { _id: importDocId, url, type }, output, error }) => {
        // Send item data + outcome status down to UI (and error if present)
        port.postMessage({ cmd: CMDS.NEXT, url, type, status: output, error })

        setImportDocStatus(importDocId, docStatus)
    }

    return {
        // Triggers on the successful finish of each batch input
        next: handleFinishedItem(IMPORT_DOC_STATUS.SUCC),
        // Triggers on any error thrown during the processing of each input
        error: handleFinishedItem(IMPORT_DOC_STATUS.FAIL),
        // Triggers when ALL batch inputs are finished
        async complete() {
            // Final reindexing so that all the finished docs are searchable
            await updatePageSearchIndex()

            // Tell UI that it's finished
            port.postMessage({ cmd: CMDS.COMPLETE })
            clearImportInProgressFlag()
        },
    }
}

/**
 * Handles calculating the estimate counts for history and bookmark imports.
 * @returns {any} The state containing import estimates completed and remaining counts.
 */
async function getEstimateCounts() {
    // Check if the importHistory stage was run previously to search history from that time
    const startTime = await getLastImportTime()

    const { completed: histCompleted, remaining: histRemaining } = await getHistoryEstimates({ startTime })
    // TODO: switch this with async getBookmarkEstimates call when implemented
    const bmCompleted = 10
    const bmRemaining = 0

    return {
        completed: {
            history: histCompleted,
            bookmark: bmCompleted,
        },
        remaining: {
            history: histRemaining,
            bookmark: bmRemaining,
        },
    }
}

/**
 * Handles fetching the input/state for the batcher (pending import docs).
 * @return Array<ImportDoc> The input derived from stored DB import docs with pending status.
 */
async function getBatchInput() {
    const fields = ['_id', 'url', 'type', 'dataDocId']
    const { docs } = await getImportDocs({ status: IMPORT_DOC_STATUS.PENDING }, fields)
    return docs
}

/**
 * Essentially the logic which happens when the user presses the "Start Import" button.
 * @param {any} batch The init'd batcher to init with input and then start.
 */
async function startImport(port, batch) {
    // Check if the importHistory stage was run previously to search history from that time
    const startTime = await getLastImportTime()

    // Perform history-stubs, vists, and history import docs creation, if import not in progress
    const importInProgress = await getImportInProgressFlag()
    if (!importInProgress) {
        await importHistory({ startTime })
    }

    // Tell UI to finish loading state and move into progress view
    port.postMessage({ cmd: CMDS.START })

    setLastImportTime()
    setImportInProgressFlag()

    // Start the batcher with needed input
    batch.init(await getBatchInput())
    batch.start()
}

/**
 * The cleanup logic that happens when user chooses to finish an import
 * (either after completion or cancellation).
 */
async function finishImport(port) {
    clearImportInProgressFlag()

    // Re-init the estimates view with updated estimates data
    const estimateCounts = await getEstimateCounts()
    port.postMessage({ cmd: CMDS.INIT, ...estimateCounts })
}

/**
 * Main connection handler to handle background importing and fetch&analysis batching
 * logic via commands issued from the UI.
 */
export default async function importsConnectionHandler(port) {
    // Make sure to only handle connection logic for imports (allows other use of runtime.connect)
    if (port.name !== IMPORT_CONN_NAME) return

    console.log('importer connected')

    const batch = initBatch({
        asyncCallback: processImportDoc,
        concurrency: 5,
        observer: getBatchObserver(port),
    })

    // If import isn't started earlier, get estimates and set view state to init
    const importInProgress = await getImportInProgressFlag()
    if (!importInProgress) {
        // Make sure estimates view init'd with count data
        const estimateCounts = await getEstimateCounts()
        port.postMessage({ cmd: CMDS.INIT, ...estimateCounts })
    } else {
        // If import is in progress, we need to make sure it's input is ready to process again
        batch.init(await getBatchInput())
        // Make sure to start the view in paused state
        port.postMessage({ cmd: CMDS.PAUSE })
    }

    // Handle any incoming messages to control the batch
    port.onMessage.addListener(async ({ cmd }) => {
        switch (cmd) {
            case CMDS.START: return await startImport(port, batch)
            case CMDS.RESUME: return batch.start()
            case CMDS.PAUSE: return batch.pause()
            case CMDS.STOP: return batch.stop()
            case CMDS.FINISH: return await finishImport(port)
            default: return console.error(`unknown command: ${cmd}`)
        }
    })
}
