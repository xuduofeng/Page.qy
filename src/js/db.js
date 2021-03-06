const DataStore = require('nedb');
const path = require('path');
const config = require('./config');
const fs = require('node-fs-extra');


// Define the database of articles
const articlePath = path.join(__dirname, '../../db/article');
const article = new DataStore({
    filename: articlePath,
    autoload: true
});



// Export functions to call
module.exports.isArticleExist = isArticleExist;
module.exports.createArticle = createArticle;
module.exports.editArticle = editArticle;
module.exports.deleteArticle = deleteArticle;
module.exports.getArticleList = getArticleList;
module.exports.editArticle = editArticle;
module.exports.togglePublish = togglePublish;
module.exports.isArticlePublished = isArticlePublished;
module.exports.getPublishedArticleList = getPublishedArticleList;
module.exports.backup = backup;
module.exports.restore = restore;
module.exports.getArticle = getArticle;
module.exports.statistic = statistic;



// Generate an unique key
async function keyGenerator() {
    let key = "";
    const possible = "abcdefghijklmnopqrstuvwxyz0123456789";

    for(let i=0; i < 6; i++)
        key += possible.charAt(Math.floor(Math.random() * possible.length));

    if (!(await isArticleExist(key)))
        return key;
    return keyGenerator()
}



////////////// Base functions to operate database ////////////////


// Rewrite 'insert' method using 'async/await'
async function insert(data, db) {
    if (!data || typeof data !== 'object') {
        console.error(`Function 'insert' except an object instead of ${typeof data} as the first argument.`);
        return;
    }

    return new Promise((resolve, reject) => {
        db.insert(data, (error, doc) => {
            error && reject(`An error occurred inside the 'insert' function.`);
            doc && resolve(doc);
        })
    })
}


// Rewrite 'update' method using 'async/await'
async function update(data, db) {
    if (!data || typeof data !== 'object') {
        console.error(`Function 'update' except an object instead of ${typeof options} as the first argument.`);
        return;
    }

    return new Promise((resolve, reject) => {
        db.update({key: data.key}, data, {}, (error, doc) => {
            error && reject(`An error occurred inside the 'update' function: ${error}`);
            doc && resolve(doc);
        })
    })
}


// Rewrite 'find' method using 'async/await'
async function find(data, db) {
    !data && (data = {});
    !db && (db = article);
    if (typeof data !== 'object') {
        data = {};
        console.error(`Function 'find' except an object instead of ${typeof data} as the first argument.`);
    }

    return new Promise((resolve, reject) => {
        db.find(data).exec((error, docs) => {
            error && reject(`An error occurred inside the 'find' function.`);
            docs && resolve(docs);
        })
    })
}


// Rewrite 'remove' method using 'async/await'
async function remove(data, db) {
    if (!data || typeof data !== 'object') {
        console.error(`Function 'remove' except an object instead of ${typeof data} as the first argument.`);
        return;
    }

    return new Promise((resolve, reject) => {
        db.remove(data, {}, (error) => {
            error && reject('An error occurred inside the database.');
            resolve(data);
        })
    })
}



////////////// Base functions to operate database ////////////////


// Pass an object which contains 'key' or 'title' or both
// to check if one article is exist
async function isArticleExist(key) {
    return (await find({key: key}, article)).length > 0
}


// Passing data and create an article
async function createArticle(data) {
    if (!data || typeof data !== 'object')
        return console.error(`Function 'create' except an object instead of ${typeof data} as the first argument.`);
    const options = {
        key: await keyGenerator(),
        createDate: (new Date()).toString(),
        editDate: (new Date()).toString(),
        historyContent: [],
        type: 'article',
        published: false,
        content: data.content,
        introduction: data.introduction,
        tags: data.tags,
        title: data.title,
    };
    const newArticle = await insert(options, article);
    const title = newArticle.title === '' ? 'Untitled Article' : newArticle.title;
    console.log(`Create article '${title}' success at ${newArticle.createDate}.`);
    return newArticle;
}


async function editArticle(data) {
    if (await checkData(data)) {
        const prevArticle = (await find({key: data.key}, article))[0];
        const changed = compareChange(prevArticle, data);

        if (changed.length === 0) {
            const title = prevArticle.title === '' ? 'Untitled Article' : prevArticle.title;
            console.log(`Nothing changed of 'article ${title}'`);
            return false;
        }

        const editDate = (new Date()).toString();
        let historyContent = prevArticle.historyContent;
        historyContent.unshift(function() {
            const newHistoryData = {
                title: prevArticle.title,
                content: prevArticle.content,
                introduction: prevArticle.introduction,
                changed: changed,
                editDate: editDate
            };
            'tags' in prevArticle &&
                (newHistoryData.tags =  prevArticle.tags);
            return newHistoryData;
        }());
        const maxHistory = parseInt(config.get().maxHistory);
        historyContent.length > maxHistory &&
            (historyContent = historyContent.slice(0, maxHistory));
        const newArticle = {
            editDate: editDate,
            historyContent: historyContent,
            type: 'article',
            key: data.key,
            createDate: data.createDate || prevArticle.createDate,
            published: data.published || prevArticle.published,
            content: data.content,
            introduction: data.introduction,
            tags: data.tags,
            title: data.title,
        };
        if (await update(newArticle, article)) {
            const title = newArticle.title === '' ?
                'Untitled Article' : newArticle.title;
            console.log(`Update article '${title}' success at ${editDate}.`);
            return newArticle;
        }
    }
    else
        return (await find({key: data.key}, article))[0];


    async function checkData(data) {
        if (!data || typeof data !== 'object') {
            console.error(`Function 'editArticle' except an object instead of ${typeof data} as the first argument.`);
            return false;
        }

        if (!'key' in data) {
            console.error('Update article failed with invalid arguments.');
            return false;
        }

        // Check this article is exist or not.
        if (! await isArticleExist(data.key)) {
            console.error('Update article failed for this article is not exist.');
            return false
        }

        return true;
    }

    function compareChange(preData, newData) {
        const changed = [];
        preData.title !== newData.title &&
            changed.push('title');
        preData.content !== newData.content &&
            changed.push('content');
        if (preData.tags.length !== newData.tags.length) {
            changed.push('tags');
            return changed;
        }

        let tagChanged = false;
        for (tag of newData.tags)
            !preData.tags.includes(tag) && (tagChanged = true);
        tagChanged && changed.push('tags');
        return changed;
    }
}


// Pass a 'key' to delete an article
async function deleteArticle(key) {
    if (!key) {
        console.error(`Delete article failed with invalid argument.`);
        return false;
    } else if (!(await isArticleExist(key))) {
        console.warn(`Delete article failed for it's not exist.`);
        return false;
    }

    let title = (await find({key: key}, article))[0].title;
    title === '' && (title = 'Untitled Article');
    await remove({key: key}, article);
    console.log(`Delete article '${title}' success at ${(new Date()).toString()}`);
}


// Get articles
async function getArticleList() {
    return (await find({type: 'article'}, article))
        .sort((a, b) => (
            (new Date(b.createDate)).getTime() - (new Date(a.createDate)).getTime())
        );
}

async function getArticle(options) {
    const result = await find(
        Object.assign(options, { type: 'article' }), article);
    if (result.length === 1) return result[0];
    return result;
}


async function togglePublish(key) {
    const data = (await find({key: key}, article))[0];
    const isPublished = data.published;
    await update(Object.assign(data, {
        published: !isPublished
    }), article);
    console.log(`${isPublished ? 'Unpublished' : 'Published'} article '${(await find({key: key}, article))[0].title}' success!`);
    return await isArticlePublished(key);
}


async function isArticlePublished(key) {
    let data = (await find({key: key}, article))[0];
    return data.published
}


async function getPublishedArticleList() {
    return (await find({type: 'article', published: true}, article))
        .sort((a, b) => (
            (new Date(b.createDate)).getTime() - (new Date(a.createDate)).getTime())
        );
}


async function statistic() {
    const result = {};
    const tags = [];
    const articles = await getArticleList();
    for (let article of articles)
        for (let tag of article.tags)
            !tags.includes(tag) && tags.push(tag)
    result.articleStatistic = articles.length;
    result.tagStatistic = tags.length;
    return result;
}


function backup(target) {
    !fs.existsSync(target) && fs.mkdirsSync(target);
    fs.copySync(path.join(articlePath, '../'), target);
    return path.join(target);
}


function restore(target) {
    fs.copySync(target, path.join(articlePath, '../'));
}
